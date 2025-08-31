import { corsHandler, REGION } from "./functionsUtil";
import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldPath } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import * as crypto from "crypto";

const db = admin.firestore();

export const sendPaymentEmails = onRequest({
    region: REGION,
    cors: true
}, async (request, response) => {
    corsHandler(request, response, async () => {
        try {
            const { paymentIds } = request.body;
            
            logger.info(paymentIds)
            const emailDocs = await db.collection('paymentDueEmails')
                .where(FieldPath.documentId(), 'in', paymentIds)
                .get();
            const batch = db.batch();
            const processedEmails = [];

            for (const doc of emailDocs.docs) {
                const emailData = doc.data();
                
                const mailRef = db.collection('mail').doc();
                const { status, ...emailDataWithoutStatus } = emailData;
                batch.set(mailRef, {
                    ...emailDataWithoutStatus
                });
                batch.update(doc.ref, { status: 'Triggered' });
                processedEmails.push({
                    id: doc.id,
                    recipients: emailData.to?.length || 0,
                    dueDate: emailData.dueDate
                });
            }

            await batch.commit();

            response.status(200).json({
                success: true,
                message: 'Payment due emails processed successfully',
                processedCount: processedEmails.length,
                processedEmails
            });

        } catch (error) {
            logger.error('Error while processing payment due emails', error);
            response.status(500).json({ error: 'Internal server error' });
        }
    });
});

export const paymentsDue = onRequest({
    region: REGION,
    cors: true
}, async (request, response) => {

    corsHandler(request, response, async () => {
        try {
            const range = Number(request.query.range ?? 31);
            await queueUpPaymentDueEmails(range);
            const pendingPayments = await db.collection('paymentDueEmails').where('status', '==', 'Pending').get();
            const nonExpiredEmails = await deleteExpiredPaymentEmails(pendingPayments);

            response.status(200).json(nonExpiredEmails);
        } catch (error) {
            logger.error('Error while getting payments due', error);
            response.status(500).json({ error: 'Internal server error' });
        }
    });
});

async function deleteExpiredPaymentEmails(pendingPayments: admin.firestore.QuerySnapshot<admin.firestore.DocumentData, admin.firestore.DocumentData>) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let deletedCount = 0;
    const batch = db.batch();
    const nonExpiredEmails = [];

    for (const doc of pendingPayments.docs) {
        const dueDateString = doc.data().dueDate;
        const dueDate = parseDateMMDDYYYY(dueDateString);

        if (dueDate < today) {
            batch.delete(doc.ref);
            deletedCount++;
            logger.info(`Deleting expired payment due email with due date: ${dueDateString}. Users: ${doc.data().users}`);
        } else {
            nonExpiredEmails.push({
                id: doc.id,
                dueDate: dueDateString,
                users: doc.data().users,
                totalDue: doc.data().total
            });
        }
    }

    if (deletedCount > 0) {
        await batch.commit();
        logger.info(`Successfully deleted ${deletedCount} expired payment due emails`);
    }

    return nonExpiredEmails;
}

async function queueUpPaymentDueEmails(range: number) {
    try {
        const classes = await getCurrentClasses();
        const monthsToQuery = getMonthsToQuery(range);
        const paymentPromises =
            classes.docs.map((doc: admin.firestore.QueryDocumentSnapshot) => {
                return getMonthsPayments(doc.id, monthsToQuery);
            });
        const paymentsApplied = (await Promise.all(paymentPromises)).flat();
        const paidMeta = getPaidMeta(paymentsApplied);
        const paidKeys = new Set(Array.from(paidMeta).map((paid: any) => `${paid.classId}:${paid.email}`));
        const unpaidClasses = getUnpaidClasses({ docs: classes.docs } as admin.firestore.QuerySnapshot, paidKeys);
        const classesDue = getPaymentsDue(range, unpaidClasses.map((item: any) => item.classDoc));
        const unpaidEmailsByClass =
            classesDue.reduce((acc, clazz) => {
                const unpaidClass = unpaidClasses.find((item: any) => item.classDoc.id === clazz.id);
                if (unpaidClass) {
                    acc[clazz.id] = unpaidClass.unpaidEmails;
                }
                return acc;
            }, {} as Record<string, string[]>);

        const emailJsons = await generateEmails(unpaidEmailsByClass, classesDue);
        let newEmailCount = 0;
        let duplicateEmailCount = 0;
        for (const emailJson of emailJsons) {
            if (emailJson) {
                // Create a unique ID based on the sorted emails and due date
                const sortedEmails = [...emailJson.to].sort().join(',');
                const uniqueId = generateEmailHash(sortedEmails, emailJson.dueDate);

                    const existingDoc = await db.collection('paymentDueEmails').doc(uniqueId).get();

                if (!existingDoc.exists) {
                    newEmailCount++;
                    await db.collection('paymentDueEmails').doc(uniqueId).set(emailJson);
                    logger.info(`Payment due email queued for ${emailJson.to.length} recipients on ${emailJson.dueDate}`);
                } else {
                    duplicateEmailCount++;
                    logger.info(`Email already created for this group of recipients on ${emailJson.dueDate}`);
                }
            }
        }
    } catch (error) {
        logger.error('Error while determining classes with upcoming payments due', error);
    }
}

async function generateEmails(unpaidEmailsByClass: Record<string, string[]>, classesDue: admin.firestore.QueryDocumentSnapshot[]) {
    const emailPromises = Object.entries(unpaidEmailsByClass).map(async ([classId, emails]) => {
        const classDoc = classesDue.find(clazz => clazz.id === classId);
        if (!classDoc) return null;

        const users = await getUsers(emails);
        const classData = classDoc.data();
        const dueDate = getPaymentDate(classData);
        const formattedDate = formatDateForEmail(dueDate);
        const subject = `Inglês a Bordo - Pagamento Vencendo ${formattedDate}`;
        const total = {
            amount: classData.paymentConfig.amount || '',
            currency: classData.paymentConfig.currency || ''
        }
        const text = `Seu pagamento para o Inglês a Bordo vence ${formattedDate}. Por favor, realize o pagamento para continuar frequentando as aulas.`;
        const html = `
        <h2>Pagamento Vencendo</h2>
        <p>Seu pagamento para o Inglês a Bordo vence ${formattedDate}.</p>
        <p>Por favor, realize o pagamento para continuar frequentando as aulas.</p>
        <p>Obrigado,<br>Equipe Inglês a Bordo</p>
    `;

        return generateEmailJson({
            to: ['cursoinglesabordo@gmail.com'], // emails,
            subject,
            text,
            html,
            dueDate: formatDateMMDDYYYY(dueDate),
            users,
            total
        });
    });

    const results = await Promise.all(emailPromises);
    return results.filter(Boolean);
}

function generateEmailJson({
    to,
    subject,
    text,
    html,
    dueDate,
    users,
    total
}: {
    to: string[];
    subject: string;
    text: string;
    html: string;
    dueDate: string;
    users: Array<{ name: string; email: string }>,
    total: { amount: string; currency: string }
}) {
    return {
        to,
        dueDate,
        message: {
            subject,
            text,
            html
        },
        users,
        status: "Pending",
        total
    };
}

function getUnpaidClasses(classes: admin.firestore.QuerySnapshot, paidKeys: Set<string>) {
    return classes
        .docs
        .map((doc: admin.firestore.QueryDocumentSnapshot) => {
            const studentEmails = doc.data().studentEmails;
            const unpaidEmails = studentEmails.filter((email: string) =>
                !paidKeys.has(`${doc.id}:${email}`)
            );
            return {
                classDoc: doc,
                unpaidEmails
            };
        })
        .filter((item: any) => item.unpaidEmails.length > 0);
}

function getPaymentDate(classData: any) {
    const now = new Date();
    const dueDate = new Date();
    switch (classData.paymentConfig.type) {
        case 'monthly':
            switch (classData.paymentConfig.monthlyOption) {
                case 'first':
                    if (now.getUTCDate() > 1) {
                        dueDate.setUTCMonth(now.getUTCMonth() + 1, 1);
                    }
                    break;
                case 'last':
                    dueDate.setUTCMonth(now.getUTCMonth() + 1, 0);
                    break;
                case 'fifteen':
                    if (now.getUTCDate() > 15) {
                        dueDate.setUTCMonth(now.getUTCMonth() + 1, 15);
                    } else {
                        dueDate.setUTCMonth(now.getUTCMonth() + 2, 15);
                    }
                    break;
            }
            break;
        case 'weekly':
            const intervalDays = classData.paymentConfig.weeklyInterval * 7;
            const startDate = new Date(classData.paymentConfig.startDate);
            const diffInMS = now.getTime() - startDate.getTime();
            const diffInDays = Math.floor(diffInMS / (1000 * 60 * 60 * 24));
            const intervalsPassed = Math.floor(diffInDays / intervalDays);
            const nextDueDate = new Date(startDate);
            nextDueDate.setDate(startDate.getDate() + (intervalsPassed + 1) * intervalDays);
            dueDate.setTime(nextDueDate.getTime());
            break;
    }
    return dueDate;
}

function getPaymentsDue(dayRange: number, unpaidClasses: admin.firestore.QueryDocumentSnapshot[]) {
    const now = new Date();
    return unpaidClasses.filter(clazz => {
        const dueDate = getPaymentDate(clazz.data());
        const daysUntilDue = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        return daysUntilDue <= dayRange;
    });
}

function getPaidMeta(paymentsApplied: admin.firestore.QuerySnapshot[]) {
    return new Set(
        paymentsApplied
            .map(payment =>
                payment.docs
                    .filter((doc: admin.firestore.QueryDocumentSnapshot) => doc.data().status === 'completed')
                    .map((doc: admin.firestore.QueryDocumentSnapshot) => ({
                        'classId': doc.data().classSessionId,
                        'email': doc.data().userId
                    }))
            )
            .flat()
    );
}

async function getUsers(emails: string[]) {
    const users = await db.collection('users').where('email', 'in', emails).get();
    return users.docs.map((doc: admin.firestore.QueryDocumentSnapshot) => ({
        name: doc.data().name,
        email: doc.data().email
    }));
}

async function getCurrentClasses() {
    const endOfMonth = getEndOfMonthDate();
    const snapshot = await db.collection('classes')
        .where('endDate', '>', endOfMonth)
        .get();

    // Also get classes with null endDate
    const nullEndDateSnapshot = await db.collection('classes')
        .where('endDate', '==', null)
        .get();

    // Combine the results
    const allDocs = [...snapshot.docs, ...nullEndDateSnapshot.docs];
    return { docs: allDocs };
}

function getMonthsPayments(classId: string, months: number[]) {
    const monthStrings = months.map(month => getMonthString(month));
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of day for consistent comparison

    return db.collection('payments')
        .where('classSessionId', '==', classId)
        .where('month', 'in', monthStrings)
        .where('dueDate', '>=', today)
        .get();
}

function getMonthString(month: number) {
    const now = new Date();
    const year = now.getFullYear();
    const formattedMonth = String(month).padStart(2, '0');
    return `${year}-${formattedMonth}`;
}

function getEndOfMonthDate() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
}

function formatDateForEmail(date: Date): string {
    const months = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    const month = months[date.getMonth()];
    const day = date.getDate();
    return `${day} de ${month}`;
}

function formatDateMMDDYYYY(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}-${day}-${year}`;
}

function generateEmailHash(emails: string, dueDate: string): string {
    const combined = `${emails}_${dueDate}`;
    const hash = crypto.createHash('sha256').update(combined).digest('hex');
    // Take first 8 characters of hash for shorter ID, convert to base36 for compactness
    const shortHash = parseInt(hash.substring(0, 12), 16).toString(36);
    // Pad to ensure exactly 8 characters
    return shortHash.padStart(10, '0');
}

function getMonthsToQuery(range: number): number[] {
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // getMonth() returns 0-11, so add 1
    const currentDay = now.getDate();

    // Calculate the maximum day we need to check
    const maxDay = currentDay + range;

    // If the range doesn't extend beyond the current month, only query current month
    if (maxDay <= getDaysInMonth(now.getFullYear(), currentMonth)) {
        return [currentMonth];
    }

    // If the range extends to the next month, include both months
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    return [currentMonth, nextMonth];
}

function getDaysInMonth(year: number, month: number): number {
    return new Date(year, month, 0).getDate();
}

function parseDateMMDDYYYY(dateString: string): Date {
    const [month, day, year] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day); // month - 1 because Date constructor uses 0-based months
}