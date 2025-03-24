import { Language } from '../contexts/LanguageContext';

interface Translation {
  // Auth & Profile
  login: string;
  signup: string;
  logout: string;
  profile: string;
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  newPassword: string;
  updateProfile: string;
  profileUpdated: string;
  language: string;
  birthdate: string;
  birthdateFormat: string;
  birthday: string;
  birthdays: string;
  emailNotEditable: string;
  amountPaid: string;
  amountDue: string;
  
  // Admin Schedule Navigation
  back: string;
  createClass: string;
  scrollHorizontallyToSeeAllColumns: string;
  multipleDays: string;
  weekly: string;
  monthly: string;
  monthly1stDay: string;
  monthly15thDay: string;
  monthlyLastDay: string;
  firstDayOfMonth: string;
  fifteenthDayOfMonth: string;
  lastDayOfMonth: string;
  uploadPDFContractDocumentForThisClassThisIsOptionalButRecommendedForKeepingTrackOfAgreementsWithStudents: string;
  viewCurrentContract: string;
  uploadNewFileToReplace: string;
  howOftenPaymentsShouldBeProcessedForWeeklyPaymentsThisIsOnlyApplicableForWeeklyClasses: string;
  saving: string;
  
  // Navigation
  dashboard: string;
  home: string;
  schedule: string;
  classMaterials: string;
  adminPanel: string;
  manageUsers: string;
  manageSchedules: string;
  manageMaterials: string;
  classPlans: string;
  
  // Dashboard
  quickActions: string;
  manageScheduleDesc: string;
  classMaterialsDesc: string;
  upcomingClasses: string;
  pastClasses: string;
  viewAll: string;
  yourUpcomingClasses: string;
  sunday: string;
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  class: string;
  noClassesScheduled: string;
  students: string;
  pair: string;
  group: string;
  calendar: string;
  previous: string;
  next: string;
  noUpcomingClasses: string;
  noPastClasses: string;
  paymentsDue: string;
  classOn: string;
  materials: string;
  slides: string;
  dayDetails: string;
  noDetailsAvailable: string;
  nothingScheduledForThisDay: string;
  days: string;
  
  // Schedule
  courseSchedule: string;
  scheduleDescription: string;
  previousMonth: string;
  nextMonth: string;
  weeklyScheduleSummary: string;
  studentsLabel: string;
  dayOfWeek: string;
  date: string;
  time: string;
  notes: string;
  notesInfo: string;
  privateNotes: string;
  privateNotesInfo: string;
  selectDayToViewDetails: string;
  availableClassDates: string;
  
  // Class Materials
  classMaterialsTitle: string;
  selectMonthLabel: string;
  selectDateLabel: string;
  selectClass: string;
  uploadMaterials: string;
  addLinkPlaceholder: string;
  uploading: string;
  existingMaterials: string;
  materialsForDate: string;
  selectDateWithClass: string;
  pleaseLogin: string;
  failedToLoad: string;
  usefulLinks: string;
  noMaterialsFound: string;
  downloadSlides: string;
  noMaterialsAvailable: string;
  addMaterials: string;
  
  // Common
  save: string;
  cancel: string;
  edit: string;
  delete: string;
  add: string;
  loading: string;
  error: string;
  success: string;
  month: string;
  year: string;
  for: string;
  of: string;
  page: string;
  total: string;

  // Payment Configuration
  paymentConfiguration: string;
  weeklyInterval: string;
  selectPaymentDay: string;
  firstDayMonth: string;
  fifteenthDayMonth: string;
  lastDayMonth: string;
  pleaseSpecifyWeeklyInterval: string;
  pleaseSelectPaymentDay: string;
  paymentStartDate: string;
  addNewUser: string;
  generateSignupLink: string;
  paymentDue: string;
  weeklyPayment: string;
  monthlyPayment: string;
  paymentLink: string;
  addPaymentLink: string;
  noPaymentLink: string;
  amount: string;

  // Days of Week - Short Names
  sundayShort: string;
  mondayShort: string;
  tuesdayShort: string;
  wednesdayShort: string;
  thursdayShort: string;
  fridayShort: string;
  saturdayShort: string;

  // Admin Schedule
  manageClasses: string;
  addNewClass: string;
  createNewClass: string;
  dayAndTime: string;
  courseType: string;
  startDate: string;
  endDate: string;
  classStartDate: string;
  actions: string;
  optional: string;
  selectStudents: string;
  noStudentsAssigned: string;
  pending: string;
  unknownEmail: string;
  classNotFound: string;
  invalidField: string;
  updateSuccessful: string;
  updateFailed: string;
  noNotes: string;
  noEndDate: string;
  
  // Class Configuration
  classConfiguration: string;
  classSchedule: string;
  startTime: string;
  endTime: string;
  classFrequency: string;
  addDay: string;
  day: string;
  noScheduleDetails: string;
  noSchedulesAdded: string;
  
  // Table Headers
  frequency: string;
  paymentType: string;
  paymentAmount: string;
  paymentDay: string;
  contract: string;
  viewContract: string;
  noContract: string;
  deleting: string;

  // Admin Users
  teacherAccount: string;
  adminAccount: string;
  enterFullName: string;
  enterEmailAddress: string;
  userStatus: string;
  activeUser: string;
  pendingSignup: string;
  copyLink: string;
  confirmDelete: string;
  signupLinkCopied: string;
  signupLinkExpires: string;
  failedToCopyLink: string;
  pleaseEnterNameEmail: string;
  failedToGenerateLink: string;
  failedToFetchUsers: string;
  failedToDeleteUser: string;
  cannotDeleteOwnAccount: string;
  userNotFound: string;
  userDeleted: string;
  unauthorizedAction: string;
  pleaseEnterName: string;
  enterName: string;
  nameUpdated: string;
  failedToUpdateName: string;
  birthdateUpdated: string;
  failedToUpdateBirthdate: string;
  copy: string;

  // URL Validation
  invalidUrl: string;

  // Payment Completion
  completed: string;
  markAsCompleted: string;
  allPaymentsCompleted: string;
  markAsIncomplete: string;
  processing: string;
  paymentCompleted: string;
  completedOn: string;
  confirm: string;
  selectCompletionDate: string;

  // Admin Schedule Errors and Success Messages
  admin: {
    schedule: {
      errors: {
        selectStudent: string;
        addSchedule: string;
        monthlyPaymentDate: string;
        contractUpload: string;
        createClass: string;
        deleteClass: string;
      };
      success: {
        classCreated: string;
        classDeleted: string;
      };
      confirmDelete: string;
    };
  };

  // Timezones
  timezones: {
    eastern: string;
    central: string;
    mountain: string;
    pacific: string;
    brasilia: string;
    gmt: string;
    cet: string;
    msk: string;
    jst: string;
    cst: string;
    aet: string;
    local: string;
  };

  timezone: string;
  classTimesDisplayed: string;
  studentsSeeTimesConverted: string;
  onlySelectedDates: string;
  selectedFile: string;
  everyXNumberWeeks: string;
  onceAMonth: string;
  forMonthlyPayments: string;
  startDateMustBe1st15thOrLastDayOfMonth: string;

  paymentFrequency: string;
  every: string;
  week: string;
  weeks: string;
  autoSet: string;
  paymentDayAutoSet: string;
  enterURLWhereStudentsCanMakePayments: string;
  currency: string;
  currencyBRL: string;
  currencyUSD: string;
  currencyEUR: string;

  // Class Plans
  templateLibrary: string;
  noTemplatesAvailable: string;
  templateDescription: string;
  createTemplate: string;
  templateName: string;
  enterTemplateName: string;
  applyTemplate: string;
  applyToClassPlan: string;
  templateCreated: string;
  templateDeleted: string;
  templateUpdated: string;
  templateItems: string;
  noItemsInTemplate: string;
  topLevelItems: string;
  moreItems: string;
  createdBy: string;
  addFirstItem: string;
  noClassPlan: string;
  addNewItem: string;
  editItem: string;
  itemTitle: string;
  itemDescription: string;
  enterItemTitle: string;
  enterItemDescription: string;
  saveChanges: string;
  addChildItem: string;
  insertItemAbove: string;
  deleteClassPlan: string;
  deleteClassPlanWarning: string;
  deleteClassPlanConfirm: string;
  monthlyView: string;
  allPlans: string;
  selectStudent: string;
  noClassPlansExist: string;
  switchToMonthlyView: string;
  itemsCompleted: string;
  noItemsInPlan: string;
  addItemToGetStarted: string;
  planFor: string;
  insertAbove: string;
  expandCollapse: string;
  itemMarkedCompleted: string;
  itemMarkedIncomplete: string;
  templateApplied: string;
  itemAdded: string;
  itemUpdated: string;
  itemDeleted: string;
  childItemAdded: string;
  itemInserted: string;
  noTemplatesYet: string;
  templateReuse: string;
  editTemplate: string;
  viewTemplate: string;
  templateStructureNote: string;

  // Homework
  homework: string;
  addHomework: string;
  noHomework: string;
  homeworkTitle: string;
  homeworkDescription: string;
  allowTextSubmission: string;
  allowFileSubmission: string;
  submissionType: string;
  dueDate: string;
  noHomeworkAssignments: string;
  homeworkSubmissions: string;
  noSubmissionsYet: string;
  submittedOn: string;
  grade: string;
  feedback: string;
  submitFeedback: string;
  upcoming: string;
  past: string;
  upcomingHomework: string;
  pastHomework: string;
  noUpcomingHomework: string;
  noPastHomework: string;
  yourHomework: string;
}

const translations: Record<Language, Translation> = {
  'en': {
    // Auth & Profile
    login: 'Login',
    signup: 'Sign Up',
    logout: 'Logout',
    profile: 'Profile',
    name: 'Name',
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm Password',
    newPassword: 'New Password',
    updateProfile: 'Update Profile',
    profileUpdated: 'Profile updated successfully',
    language: 'Language',
    birthdate: 'Birthdate',
    birthdateFormat: 'MM-DD',
    birthday: 'Birthday',
    birthdays: 'Birthdays',
    emailNotEditable: 'Email cannot be edited. To change the email, the user must be deleted and recreated with the correct email.',
    amountPaid: 'Amount paid',
    amountDue: 'Amount due',
    
    // Admin Schedule Navigation
    back: 'Back',
    createClass: 'Create Class',
    scrollHorizontallyToSeeAllColumns: 'Scroll horizontally to see all columns',
    multipleDays: 'Multiple Days',
    weekly: 'Weekly',
    monthly: 'Monthly',
    monthly1stDay: '1st of Month',
    monthly15thDay: '15th of Month',
    monthlyLastDay: 'Last Day of Month',
    firstDayOfMonth: 'First Day of Month',
    fifteenthDayOfMonth: '15th Day of Month',
    lastDayOfMonth: 'Last Day of Month',
    uploadPDFContractDocumentForThisClassThisIsOptionalButRecommendedForKeepingTrackOfAgreementsWithStudents: 'Upload PDF contract document for this class (optional but recommended for keeping track of agreements with students)',
    viewCurrentContract: 'View Current Contract',
    uploadNewFileToReplace: 'Upload new file to replace',
    howOftenPaymentsShouldBeProcessedForWeeklyPaymentsThisIsOnlyApplicableForWeeklyClasses: 'How often payments should be processed for weekly payments (this is only applicable for weekly classes)',
    saving: 'Saving...',
    
    // Navigation
    dashboard: 'Dashboard',
    home: 'Home',
    schedule: 'Schedule',
    classMaterials: 'Class Materials',
    adminPanel: 'Admin Panel',
    manageUsers: 'Users',
    manageSchedules: 'Classes',
    manageMaterials: 'Manage Materials',
    classPlans: 'Study Plans',
    
    // Dashboard
    quickActions: 'Quick Actions',
    manageScheduleDesc: 'Create or edit class sessions',
    classMaterialsDesc: 'Upload and manage materials',
    upcomingClasses: "This Week's Upcoming Classes",
    pastClasses: "This Week's Past Classes",
    viewAll: 'View All',
    yourUpcomingClasses: 'Your Upcoming Classes',
    sunday: 'Sunday',
    monday: 'Monday',
    tuesday: 'Tuesday',
    wednesday: 'Wednesday',
    thursday: 'Thursday',
    friday: 'Friday',
    saturday: 'Saturday',
    class: 'Class',
    noClassesScheduled: 'No classes scheduled for this day',
    students: 'Students',
    pair: 'Pair Class',
    group: 'Group Class',
    calendar: 'Calendar',
    previous: 'Previous',
    next: 'Next',
    noUpcomingClasses: 'No upcoming classes',
    noPastClasses: 'No past classes',
    paymentsDue: 'Payments Due',
    classOn: 'Class on',
    materials: 'Materials',
    slides: 'Slides',
    dayDetails: 'Day Details',
    noDetailsAvailable: 'No details available',
    nothingScheduledForThisDay: 'There is nothing scheduled for this day.',
    days: 'Days',
    
    // Schedule
    courseSchedule: 'Course Schedule',
    scheduleDescription: 'View and manage your class schedule.',
    previousMonth: 'Previous Month',
    nextMonth: 'Next Month',
    weeklyScheduleSummary: 'Weekly Schedule Summary',
    studentsLabel: 'Students',
    dayOfWeek: 'Day',
    date: 'Date',
    time: 'Time',
    notes: 'Notes',
    notesInfo: 'Notes will be shared with students',
    privateNotes: 'Private notes',
    privateNotesInfo: 'Private notes will not be shared with students',
    selectDayToViewDetails: 'Select a day to view class details',
    availableClassDates: 'Available class dates',
    
    // Class Materials
    classMaterialsTitle: 'Class Materials Management',
    selectMonthLabel: 'Select Month',
    selectDateLabel: 'Select Date',
    selectClass: 'Select Class on',
    uploadMaterials: 'Upload Materials',
    addLinkPlaceholder: 'Add a link to learning materials',
    uploading: 'Uploading...',
    existingMaterials: 'Existing Materials',
    materialsForDate: 'Materials for',
    selectDateWithClass: 'Select a date with a scheduled class to manage materials',
    pleaseLogin: 'Please log in to view your class materials.',
    failedToLoad: 'Failed to load class materials',
    usefulLinks: 'Useful Links',
    noMaterialsFound: 'No materials found',
    downloadSlides: 'Download Slides',
    noMaterialsAvailable: 'No materials available',
    addMaterials: 'Add materials',
    
    // Common
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    delete: 'Delete',
    add: 'Add',
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',
    month: 'Month',
    year: 'Year',
    for: 'for',
    of: 'of',
    page: 'Page',
    total: 'total',

    // Payment Configuration
    paymentConfiguration: 'Payment Configuration',
    weeklyInterval: 'Weekly Interval',
    selectPaymentDay: 'Payment Day',
    firstDayMonth: 'First day of month',
    fifteenthDayMonth: '15th of month',
    lastDayMonth: 'Last day of month',
    pleaseSpecifyWeeklyInterval: 'Please specify weekly interval',
    pleaseSelectPaymentDay: 'Please select payment day',
    paymentStartDate: 'Payment Start Date',
    addNewUser: 'Add New User',
    generateSignupLink: 'Generate Signup Link',
    paymentDue: 'Payment Due',
    weeklyPayment: 'Weekly Payment',
    monthlyPayment: 'Monthly Payment',
    paymentLink: 'Payment Link',
    addPaymentLink: 'Add payment link',
    noPaymentLink: 'No payment link available',
    amount: 'Amount',

    // Days of Week - Short Names
    sundayShort: 'Sun',
    mondayShort: 'Mon',
    tuesdayShort: 'Tue',
    wednesdayShort: 'Wed',
    thursdayShort: 'Thu',
    fridayShort: 'Fri',
    saturdayShort: 'Sat',

    // Admin Schedule
    manageClasses: 'Manage Classes',
    addNewClass: 'Add New Class',
    createNewClass: 'Create New Class',
    dayAndTime: 'Day & Time',
    courseType: 'Course Type',
    startDate: 'Start Date',
    endDate: 'End Date',
    classStartDate: 'Class Start Date',
    actions: 'Ações',
    optional: 'Optional',
    selectStudents: 'Select students...',
    noStudentsAssigned: 'No students assigned',
    pending: 'Pending',
    unknownEmail: 'Unknown Email',
    classNotFound: 'Class not found',
    invalidField: 'Invalid field',
    updateSuccessful: 'Update successful',
    updateFailed: 'Update failed',
    noNotes: 'No notes',
    noEndDate: 'No end date',
    
    // Class Configuration
    classConfiguration: 'Class Configuration',
    classSchedule: 'Class Schedule',
    startTime: 'Start Time',
    endTime: 'End Time',
    classFrequency: 'Class Frequency',
    addDay: 'Add Day',
    day: 'Day',
    noScheduleDetails: 'No schedule details',
    noSchedulesAdded: 'No schedules added. Click "Add Day" to add a class day.',
    
    // Table Headers
    frequency: 'Frequency',
    paymentType: 'Payment Type',
    paymentAmount: 'Payment Amount',
    paymentDay: 'Payment Day',
    contract: 'Contract',
    viewContract: 'View Contract',
    noContract: 'No contract',
    deleting: 'Deleting...',

    // Admin Users
    teacherAccount: 'Teacher Account',
    adminAccount: 'Admin Account',
    enterFullName: 'Enter full name',
    enterEmailAddress: 'Enter email address',
    userStatus: 'Status',
    activeUser: 'User',
    pendingSignup: 'Pending Signup',
    copyLink: 'Copy Link',
    confirmDelete: 'Are you sure you want to delete {name} ({email})?',
    signupLinkCopied: 'Signup link copied to clipboard',
    signupLinkExpires: 'Link expires in 24 hours. Copying the link extends the expiration date.',
    failedToCopyLink: 'Failed to copy signup link',
    pleaseEnterNameEmail: 'Please fill in both name and email',
    failedToGenerateLink: 'Failed to generate signup link',
    failedToFetchUsers: 'Failed to fetch users',
    failedToDeleteUser: 'Failed to delete user',
    cannotDeleteOwnAccount: 'Cannot delete your own account',
    userNotFound: 'User not found',
    userDeleted: 'User and associated data deleted successfully',
    unauthorizedAction: 'Unauthorized action',
    pleaseEnterName: 'Please enter a name',
    enterName: 'Enter name',
    nameUpdated: 'Name updated successfully',
    failedToUpdateName: 'Failed to update name',
    birthdateUpdated: 'Birthdate updated successfully',
    failedToUpdateBirthdate: 'Failed to update birthdate',
    copy: 'Copy',

    // URL Validation
    invalidUrl: 'URL must start with http:// or https://',

    // Payment Completion
    completed: 'Completed',
    markAsCompleted: 'Mark as Completed',
    allPaymentsCompleted: 'All payments completed',
    markAsIncomplete: 'Mark as Incomplete',
    processing: 'Processing...',
    paymentCompleted: 'Payment Completed',
    completedOn: 'Completed on',
    confirm: 'Confirm',
    selectCompletionDate: 'Select Completion Date',

    // Admin Schedule Errors and Success Messages
    admin: {
      schedule: {
        errors: {
          selectStudent: 'Please select at least one student for the class',
          addSchedule: 'Please add at least one schedule',
          monthlyPaymentDate: 'Monthly payments must start on the 1st, 15th, or last day of the month',
          contractUpload: 'Failed to upload contract file',
          createClass: 'Failed to create class',
          deleteClass: 'Failed to delete class'
        },
        success: {
          classCreated: 'Class created successfully',
          classDeleted: 'Class deleted successfully'
        },
        confirmDelete: 'Are you sure you want to delete this {courseType} class on {day} at {time}?'
      }
    },

    // Timezones
    timezones: {
      eastern: 'Eastern Time (ET)',
      central: 'Central Time (CT)',
      mountain: 'Mountain Time (MT)',
      pacific: 'Pacific Time (PT)',
      brasilia: 'Brasília Time (BRT)',
      gmt: 'Greenwich Mean Time (GMT)',
      cet: 'Central European Time (CET)',
      msk: 'Moscow Standard Time (MSK)',
      jst: 'Japan Standard Time (JST)',
      cst: 'China Standard Time (CST)',
      aet: 'Australian Eastern Time (AET)',
      local: 'Local Time'
    },

    timezone: 'Timezone',
    classTimesDisplayed: 'Class times will be displayed in this timezone',
    studentsSeeTimesConverted: 'Students will see times converted to their local timezone',
    onlySelectedDates: 'Only',
    selectedFile: 'Selected file',
    everyXNumberWeeks: 'Every X number of weeks',
    onceAMonth: 'Once a month',
    forMonthlyPayments: 'For monthly payments',
    startDateMustBe1st15thOrLastDayOfMonth: 'Start date must be the 1st, 15th, or last day of the month',

    paymentFrequency: 'Payment Frequency',
    every: 'Every',
    week: 'week',
    weeks: 'weeks',
    autoSet: 'auto-set',
    paymentDayAutoSet: 'Payment day is automatically set based on the selected payment start date',
    enterURLWhereStudentsCanMakePayments: 'Enter a URL where students can make payments',
    currency: 'Currency',
    currencyBRL: 'BRL',
    currencyUSD: 'USD',
    currencyEUR: 'EUR',

    // Class Plans
    templateLibrary: 'Template Library',
    noTemplatesAvailable: 'No templates available',
    templateDescription: 'Template Description',
    createTemplate: 'Create Template',
    templateName: 'Template Name',
    enterTemplateName: 'Enter Template Name',
    applyTemplate: 'Apply Template',
    applyToClassPlan: 'Apply to Class Plan',
    templateCreated: 'Template Created',
    templateDeleted: 'Template Deleted',
    templateUpdated: 'Template Updated',
    templateItems: 'Template Items',
    noItemsInTemplate: 'No items in template',
    topLevelItems: 'Top Level Items',
    moreItems: 'More Items',
    createdBy: 'Created By',
    addFirstItem: 'Add First Item',
    noClassPlan: 'No Class Plan',
    addNewItem: 'Add New Item',
    editItem: 'Edit Item',
    itemTitle: 'Item Title',
    itemDescription: 'Item Description',
    enterItemTitle: 'Enter Item Title',
    enterItemDescription: 'Enter Item Description',
    saveChanges: 'Save Changes',
    addChildItem: 'Add Child Item',
    insertItemAbove: 'Insert Item Above',
    deleteClassPlan: 'Delete Class Plan',
    deleteClassPlanWarning: 'Are you sure you want to delete this class plan?',
    deleteClassPlanConfirm: 'Are you sure you want to delete this class plan?',
    monthlyView: 'Monthly View',
    allPlans: 'All Plans',
    selectStudent: 'Select Student',
    noClassPlansExist: 'No class plans exist',
    switchToMonthlyView: 'Switch to Monthly View',
    itemsCompleted: 'Items Completed',
    noItemsInPlan: 'No items in plan',
    addItemToGetStarted: 'Add item to get started',
    planFor: 'Plan For',
    insertAbove: 'Insert Above',
    expandCollapse: 'Expand/Collapse',
    itemMarkedCompleted: 'Item marked as completed',
    itemMarkedIncomplete: 'Item marked as incomplete',
    templateApplied: 'Template Applied',
    itemAdded: 'Item Added',
    itemUpdated: 'Item Updated',
    itemDeleted: 'Item Deleted',
    childItemAdded: 'Child Item Added',
    itemInserted: 'Item Inserted',
    noTemplatesYet: 'No templates yet',
    templateReuse: 'Template Reuse',
    editTemplate: 'Edit Template',
    viewTemplate: 'View Template',
    templateStructureNote: 'For more complex changes to template structure, apply the template to a class plan, make your changes there, and save it as a new template.',

    // Homework
    homework: 'Homework',
    addHomework: 'Add Homework',
    noHomework: 'No homework',
    homeworkTitle: 'Title',
    homeworkDescription: 'Description',
    allowTextSubmission: 'Allow text submission',
    allowFileSubmission: 'Allow file submission',
    submissionType: 'Submission Type',
    dueDate: 'Due Date',
    noHomeworkAssignments: 'No homework assignments found.',
    homeworkSubmissions: 'Student Submissions',
    noSubmissionsYet: 'No submissions yet.',
    submittedOn: 'Submitted on',
    grade: 'Grade',
    feedback: 'Feedback',
    submitFeedback: 'Submit Feedback',
    upcoming: 'Upcoming',
    past: 'Past',
    upcomingHomework: 'Upcoming Homework',
    pastHomework: 'Past Homework',
    noUpcomingHomework: 'No upcoming homework assignments.',
    noPastHomework: 'No past homework assignments.',
    yourHomework: 'Your Homework',
  },
  'pt-BR': {
    // Auth & Profile
    login: 'Entrar',
    signup: 'Cadastrar',
    logout: 'Sair',
    profile: 'Perfil',
    name: 'Nome',
    email: 'Email',
    password: 'Senha',
    confirmPassword: 'Confirmar Senha',
    newPassword: 'Nova Senha',
    updateProfile: 'Atualizar Perfil',
    profileUpdated: 'Perfil atualizado com sucesso',
    language: 'Idioma',
    birthdate: 'Data de Nascimento',
    birthdateFormat: 'MM-DD',
    birthday: 'Aniversário',
    birthdays: 'Aniversários',
    emailNotEditable: 'O email não pode ser editado. Para alterar o email, o usuário deve ser excluído e recriado com o email correto.',
    amountPaid: 'Valor pago',
    amountDue: 'Valor a pagar',
    
    // Admin Schedule Navigation
    back: 'Voltar',
    createClass: 'Criar Aula',
    scrollHorizontallyToSeeAllColumns: 'Role horizontalmente para ver todas as colunas',
    multipleDays: 'Múltiplos Dias',
    weekly: 'Semanal',
    monthly: 'Mensal',
    monthly1stDay: 'Dia 1 do Mês',
    monthly15thDay: 'Dia 15 do Mês',
    monthlyLastDay: 'Último Dia do Mês',
    firstDayOfMonth: 'Primeiro Dia do Mês',
    fifteenthDayOfMonth: 'Dia 15 do Mês',
    lastDayOfMonth: 'Último Dia do Mês',
    uploadPDFContractDocumentForThisClassThisIsOptionalButRecommendedForKeepingTrackOfAgreementsWithStudents: 'Fazer upload do documento de contrato em PDF para esta aula (opcional, mas recomendado para manter o registro de acordos com os alunos)',
    viewCurrentContract: 'Ver Contrato Atual',
    uploadNewFileToReplace: 'Fazer upload de novo arquivo para substituir',
    howOftenPaymentsShouldBeProcessedForWeeklyPaymentsThisIsOnlyApplicableForWeeklyClasses: 'Com que frequência os pagamentos devem ser processados para pagamentos semanais (isso só se aplica a aulas semanais)',
    saving: 'Salvando...',
    
    // Navigation
    dashboard: 'Painel',
    home: 'Início',
    schedule: 'Agenda',
    classMaterials: 'Materiais de Aula',
    adminPanel: 'Painel Admin',
    manageUsers: 'Usuários',
    manageSchedules: 'Aulas',
    manageMaterials: 'Gerenciar Materiais',
    classPlans: 'Planos de Aula',
    
    // Dashboard
    quickActions: 'Ações Rápidas',
    manageScheduleDesc: 'Criar ou editar sessões de aula',
    classMaterialsDesc: 'Carregar e gerenciar materiais',
    upcomingClasses: "Próximas Aulas desta Semana",
    pastClasses: "Aulas Passadas desta Semana",
    viewAll: 'Ver Tudo',
    yourUpcomingClasses: 'Suas Próximas Aulas',
    sunday: 'Domingo',
    monday: 'Segunda-feira',
    tuesday: 'Terça-feira',
    wednesday: 'Quarta-feira',
    thursday: 'Quinta-feira',
    friday: 'Sexta-feira',
    saturday: 'Sábado',
    class: 'Aula',
    noClassesScheduled: 'Nenhuma aula agendada para este dia',
    students: 'Alunos',
    pair: 'Aula em Dupla',
    group: 'Aula em Grupo',
    calendar: 'Calendário',
    previous: 'Anterior',
    next: 'Próximo',
    noUpcomingClasses: 'Sem aulas futuras',
    noPastClasses: 'Sem aulas passadas',
    paymentsDue: 'Pagamentos Pendentes',
    classOn: 'Aula em',
    materials: 'Materiais',
    slides: 'Slides',
    dayDetails: 'Detalhes do Dia',
    noDetailsAvailable: 'Nenhum detalhe disponível',
    nothingScheduledForThisDay: 'Não há nada agendado para este dia.',
    days: 'Dias',
    
    // Schedule
    courseSchedule: 'Agenda de Aulas',
    scheduleDescription: 'Visualize e gerencie sua agenda de aulas.',
    previousMonth: 'Mês Anterior',
    nextMonth: 'Próximo Mês',
    weeklyScheduleSummary: 'Resumo Semanal',
    studentsLabel: 'Alunos',
    dayOfWeek: 'Dia',
    date: 'Data',
    time: 'Horário',
    notes: 'Observações',
    notesInfo: 'Observações serão compartilhadas com os alunos',
    privateNotes: 'Observações privadas',
    privateNotesInfo: 'Observações privadas não serão compartilhadas com os alunos',
    selectDayToViewDetails: 'Selecione um dia para ver os detalhes da aula',
    availableClassDates: 'Datas de aula disponíveis',
    
    // Class Materials
    classMaterialsTitle: 'Gerenciamento de Materiais de Aula',
    selectMonthLabel: 'Selecionar Mês',
    selectDateLabel: 'Selecionar Data',
    selectClass: 'Selecionar Aula em',
    uploadMaterials: 'Carregar Materiais',
    addLinkPlaceholder: 'Adicionar um link para materiais de aprendizado',
    uploading: 'Carregando...',
    existingMaterials: 'Materiais Existentes',
    materialsForDate: 'Materiais para',
    selectDateWithClass: 'Selecione uma data com uma aula agendada para gerenciar materiais',
    pleaseLogin: 'Por favor, faça login para ver seus materiais de aula.',
    failedToLoad: 'Falha ao carregar materiais de aula',
    usefulLinks: 'Links Úteis',
    noMaterialsFound: 'Nenhum material encontrado',
    downloadSlides: 'Baixar Slides',
    noMaterialsAvailable: 'Nenhum material disponível',
    addMaterials: 'Adicionar materiais',
    
    // Common
    save: 'Salvar',
    cancel: 'Cancelar',
    edit: 'Editar',
    delete: 'Excluir',
    add: 'Adicionar',
    loading: 'Carregando...',
    error: 'Erro',
    success: 'Sucesso',
    month: 'Mês',
    year: 'Ano',
    for: 'para',
    of: 'de',
    page: 'Página',
    total: 'total',

    // Payment Configuration
    paymentConfiguration: 'Configuração de Pagamento',
    weeklyInterval: 'Intervalo Semanal',
    selectPaymentDay: 'Dia de Pagamento',
    firstDayMonth: 'Primeiro dia do mês',
    fifteenthDayMonth: 'Dia 15 do mês',
    lastDayMonth: 'Último dia do mês',
    pleaseSpecifyWeeklyInterval: 'Por favor, especifique o intervalo semanal',
    pleaseSelectPaymentDay: 'Por favor, selecione o dia de pagamento',
    paymentStartDate: 'Data de Início do Pagamento',
    addNewUser: 'Adicionar Novo Usuário',
    generateSignupLink: 'Gerar Link de Cadastro',
    paymentDue: 'Pagamento Pendente',
    weeklyPayment: 'Pagamento Semanal',
    monthlyPayment: 'Pagamento Mensal',
    paymentLink: 'Link de Pagamento',
    addPaymentLink: 'Adicionar link de pagamento',
    noPaymentLink: 'Link de pagamento não disponível',
    amount: 'Valor',

    // Days of Week - Short Names
    sundayShort: 'Dom',
    mondayShort: 'Seg',
    tuesdayShort: 'Ter',
    wednesdayShort: 'Qua',
    thursdayShort: 'Qui',
    fridayShort: 'Sex',
    saturdayShort: 'Sáb',

    // Admin Schedule
    manageClasses: 'Gerenciar Aulas',
    addNewClass: 'Adicionar Nova Aula',
    createNewClass: 'Criar Nova Aula',
    dayAndTime: 'Dia e Horário',
    courseType: 'Tipo de Aula',
    startDate: 'Data de Início',
    endDate: 'Data de Término',
    classStartDate: 'Data de Início da Aula',
    actions: 'Ações',
    optional: 'Opcional',
    selectStudents: 'Selecionar alunos...',
    noStudentsAssigned: 'Nenhum aluno atribuído',
    pending: 'Pendente',
    unknownEmail: 'Email Desconhecido',
    classNotFound: 'Aula não encontrada',
    invalidField: 'Campo inválido',
    updateSuccessful: 'Atualização bem-sucedida',
    updateFailed: 'Falha na atualização',
    noNotes: 'Sem notas',
    noEndDate: 'Sem data de término',
    
    // Class Configuration
    classConfiguration: 'Configuração da Aula',
    classSchedule: 'Agenda da Aula',
    startTime: 'Horário de Início',
    endTime: 'Horário de Término',
    classFrequency: 'Frequência da Aula',
    addDay: 'Adicionar Dia',
    day: 'Dia',
    noScheduleDetails: 'Sem detalhes de agenda',
    noSchedulesAdded: 'Nenhuma agenda adicionada. Clique em "Adicionar Dia" para adicionar um dia de aula.',
    
    // Table Headers
    frequency: 'Frequência',
    paymentType: 'Tipo de Pagamento',
    paymentAmount: 'Valor do Pagamento',
    paymentDay: 'Dia do Pagamento',
    contract: 'Contrato',
    viewContract: 'Ver Contrato',
    noContract: 'Sem contrato',
    deleting: 'Excluindo...',

    // Admin Users
    teacherAccount: 'Conta de Professor',
    adminAccount: 'Conta de Admin',
    enterFullName: 'Digite o nome completo',
    enterEmailAddress: 'Digite o endereço de email',
    userStatus: 'Status',
    activeUser: 'Usuário',
    pendingSignup: 'Pendente',
    copyLink: 'Copiar Link',
    confirmDelete: 'Tem certeza que deseja excluir {name} ({email})?',
    signupLinkCopied: 'Link de cadastro copiado para a área de transferência',
    signupLinkExpires: 'O link expira em 24 horas. Copiar o link estende a data de expiração.',
    failedToCopyLink: 'Falha ao copiar link de cadastro',
    pleaseEnterNameEmail: 'Por favor, preencha nome e email',
    failedToGenerateLink: 'Falha ao gerar link de cadastro',
    failedToFetchUsers: 'Falha ao buscar usuários',
    failedToDeleteUser: 'Falha ao excluir usuário',
    cannotDeleteOwnAccount: 'Não é possível excluir sua própria conta',
    userNotFound: 'Usuário não encontrado',
    userDeleted: 'Usuário e dados associados excluídos com sucesso',
    unauthorizedAction: 'Ação não autorizada',
    pleaseEnterName: 'Por favor, insira um nome',
    enterName: 'Digite o nome',
    nameUpdated: 'Nome atualizado com sucesso',
    failedToUpdateName: 'Falha ao atualizar nome',
    birthdateUpdated: 'Data de nascimento atualizada com sucesso',
    failedToUpdateBirthdate: 'Falha ao atualizar data de nascimento',
    copy: 'Copiar',

    // URL Validation
    invalidUrl: 'URL deve começar com http:// ou https://',

    // Payment Completion
    completed: 'Concluído',
    markAsCompleted: 'Marcar como Concluído',
    allPaymentsCompleted: 'Todos os pagamentos concluídos',
    markAsIncomplete: 'Marcar como Não Concluído',
    processing: 'Processando...',
    paymentCompleted: 'Pagamento Concluído',
    completedOn: 'Concluído em',
    confirm: 'Confirmar',
    selectCompletionDate: 'Selecionar Data de Conclusão',

    // Admin Schedule Errors and Success Messages
    admin: {
      schedule: {
        errors: {
          selectStudent: 'Por favor, selecione pelo menos um aluno para a aula',
          addSchedule: 'Por favor, adicione pelo menos um horário',
          monthlyPaymentDate: 'Pagamentos mensais devem começar no dia 1, 15 ou último dia do mês',
          contractUpload: 'Falha ao fazer upload do arquivo do contrato',
          createClass: 'Falha ao criar aula',
          deleteClass: 'Falha ao excluir aula'
        },
        success: {
          classCreated: 'Aula criada com sucesso',
          classDeleted: 'Aula excluída com sucesso'
        },
        confirmDelete: 'Tem certeza que deseja excluir esta aula {courseType} na {day} às {time}?'
      }
    },

    // Timezones
    timezones: {
      eastern: 'Horário do Leste (ET)',
      central: 'Horário Central (CT)',
      mountain: 'Horário das Montanhas (MT)',
      pacific: 'Horário do Pacífico (PT)',
      brasilia: 'Horário de Brasília (BRT)',
      gmt: 'Horário de Greenwich (GMT)',
      cet: 'Horário da Europa Central (CET)',
      msk: 'Horário de Moscou (MSK)',
      jst: 'Horário do Japão (JST)',
      cst: 'Horário da China (CST)',
      aet: 'Horário da Austrália Oriental (AET)',
      local: 'Horário Local'
    },

    timezone: 'Fuso horário',
    classTimesDisplayed: 'Os horários das aulas serão exibidos neste fuso horário',
    studentsSeeTimesConverted: 'Os alunos verão os horários convertidos para seu fuso horário local',
    onlySelectedDates: 'Apenas',
    selectedFile: 'Arquivo selecionado',
    everyXNumberWeeks: 'A cada X semanas',
    onceAMonth: 'Uma vez por mês',
    forMonthlyPayments: 'Para pagamentos mensais',
    startDateMustBe1st15thOrLastDayOfMonth: 'A data de início deve ser o 1º, 15º ou último dia do mês',

    paymentFrequency: 'Frequência de Pagamento',
    every: 'A cada',
    week: 'semana',
    weeks: 'semanas',
    autoSet: 'automático',
    paymentDayAutoSet: 'O dia do pagamento é definido automaticamente com base na data de início selecionada',
    enterURLWhereStudentsCanMakePayments: 'Digite uma URL onde os alunos podem fazer pagamentos',
    currency: 'Moeda',
    currencyBRL: 'BRL',
    currencyUSD: 'USD',
    currencyEUR: 'EUR',

    // Class Plans
    templateLibrary: 'Biblioteca de Modelos',
    noTemplatesAvailable: 'Nenhum modelo disponível',
    templateDescription: 'Descrição do Modelo',
    createTemplate: 'Criar Modelo',
    templateName: 'Nome do Modelo',
    enterTemplateName: 'Digite o Nome do Modelo',
    applyTemplate: 'Aplicar Modelo',
    applyToClassPlan: 'Aplicar ao Plano de Aula',
    templateCreated: 'Modelo Criado',
    templateDeleted: 'Modelo Excluído',
    templateUpdated: 'Modelo Atualizado',
    templateItems: 'Itens do Modelo',
    noItemsInTemplate: 'Nenhum item no modelo',
    topLevelItems: 'Itens de Nível Superior',
    moreItems: 'Mais Itens',
    createdBy: 'Criado Por',
    addFirstItem: 'Adicionar Primeiro Item',
    noClassPlan: 'Nenhum Plano de Aula',
    addNewItem: 'Adicionar Novo Item',
    editItem: 'Editar Item',
    itemTitle: 'Título do Item',
    itemDescription: 'Descrição do Item',
    enterItemTitle: 'Digite o Título do Item',
    enterItemDescription: 'Digite a Descrição do Item',
    saveChanges: 'Salvar Alterações',
    addChildItem: 'Adicionar Item Filho',
    insertItemAbove: 'Inserir Item Acima',
    deleteClassPlan: 'Excluir Plano de Aula',
    deleteClassPlanWarning: 'Tem certeza que deseja excluir este plano de aula?',
    deleteClassPlanConfirm: 'Tem certeza que deseja excluir este plano de aula?',
    monthlyView: 'Visualização Mensal',
    allPlans: 'Todos os Planos',
    selectStudent: 'Selecionar Aluno',
    noClassPlansExist: 'Nenhum plano de aula existente',
    switchToMonthlyView: 'Alternar para Visualização Mensal',
    itemsCompleted: 'Itens Concluídos',
    noItemsInPlan: 'Nenhum item no plano',
    addItemToGetStarted: 'Adicionar item para começar',
    planFor: 'Plano Para',
    insertAbove: 'Inserir Acima',
    expandCollapse: 'Expandir/Recolher',
    itemMarkedCompleted: 'Item marcado como concluído',
    itemMarkedIncomplete: 'Item marcado como não concluído',
    templateApplied: 'Modelo Aplicado',
    itemAdded: 'Item Adicionado',
    itemUpdated: 'Item Atualizado',
    itemDeleted: 'Item Excluído',
    childItemAdded: 'Item Filho Adicionado',
    itemInserted: 'Item Inserido',
    noTemplatesYet: 'Nenhum modelo disponível ainda',
    templateReuse: 'Reutilizar Modelo',
    editTemplate: 'Editar Modelo',
    viewTemplate: 'Visualizar Modelo',
    templateStructureNote: 'Para alterações mais complexas na estrutura do modelo, aplique o modelo a um plano de aula, faça suas alterações lá e salve como um novo modelo.',

    // Homework
    homework: 'Tarefa',
    addHomework: 'Adicionar Tarefa',
    noHomework: 'Sem tarefa',
    homeworkTitle: 'Título',
    homeworkDescription: 'Descrição',
    allowTextSubmission: 'Permitir envio de texto',
    allowFileSubmission: 'Permitir envio de arquivo',
    submissionType: 'Tipo de Envio',
    dueDate: 'Data de Entrega',
    noHomeworkAssignments: 'Nenhuma tarefa encontrada.',
    homeworkSubmissions: 'Envios dos Alunos',
    noSubmissionsYet: 'Nenhum envio ainda.',
    submittedOn: 'Enviado em',
    grade: 'Nota',
    feedback: 'Feedback',
    submitFeedback: 'Enviar Feedback',
    upcoming: 'Próximas',
    past: 'Passadas',
    upcomingHomework: 'Próximas Tarefas',
    pastHomework: 'Tarefas Passadas',
    noUpcomingHomework: 'Nenhuma tarefa futura.',
    noPastHomework: 'Nenhuma tarefa passada.',
    yourHomework: 'Suas Tarefas',
  }
};

export const useTranslation = (language: Language) => {
  return translations[language];
}; 