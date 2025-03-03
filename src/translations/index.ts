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
  
  // Navigation
  dashboard: string;
  schedule: string;
  classMaterials: string;
  adminPanel: string;
  manageUsers: string;
  manageSchedules: string;
  manageMaterials: string;
  
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
  paymentsDue: string;
  classOn: string;
  materials: string;
  slides: string;
  
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
  
  // Common
  save: string;
  cancel: string;
  edit: string;
  delete: string;
  add: string;
  loading: string;
  error: string;
  success: string;

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
  copy: string;
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
    
    // Navigation
    dashboard: 'Dashboard',
    schedule: 'Schedule',
    classMaterials: 'Class Materials',
    adminPanel: 'Admin Panel',
    manageUsers: 'Manage Users',
    manageSchedules: 'Manage Classes',
    manageMaterials: 'Manage Materials',
    
    // Dashboard
    quickActions: 'Quick Actions',
    manageScheduleDesc: 'Create or edit class sessions',
    classMaterialsDesc: 'Upload and manage materials',
    upcomingClasses: 'Upcoming Classes',
    pastClasses: 'Past Classes',
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
    paymentsDue: 'Payments Due',
    classOn: 'Class on',
    materials: 'Materials',
    slides: 'Slides',
    
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
    
    // Common
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    delete: 'Delete',
    add: 'Add',
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',

    // Payment Configuration
    paymentConfiguration: 'Payment Configuration',
    weeklyInterval: 'Weekly Interval',
    selectPaymentDay: 'Select Payment Day',
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
    actions: 'Actions',
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
    copy: 'Copy',
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
    
    // Navigation
    dashboard: 'Painel',
    schedule: 'Agenda',
    classMaterials: 'Materiais de Aula',
    adminPanel: 'Painel Admin',
    manageUsers: 'Gerenciar Usuários',
    manageSchedules: 'Gerenciar Aulas',
    manageMaterials: 'Gerenciar Materiais',
    
    // Dashboard
    quickActions: 'Ações Rápidas',
    manageScheduleDesc: 'Criar ou editar sessões de aula',
    classMaterialsDesc: 'Carregar e gerenciar materiais',
    upcomingClasses: 'Próximas Aulas',
    pastClasses: 'Aulas Passadas',
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
    paymentsDue: 'Pagamentos Pendentes',
    classOn: 'Aula em',
    materials: 'Materiais',
    slides: 'Slides',
    
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
    
    // Common
    save: 'Salvar',
    cancel: 'Cancelar',
    edit: 'Editar',
    delete: 'Excluir',
    add: 'Adicionar',
    loading: 'Carregando...',
    error: 'Erro',
    success: 'Sucesso',

    // Payment Configuration
    paymentConfiguration: 'Configuração de Pagamento',
    weeklyInterval: 'Intervalo Semanal',
    selectPaymentDay: 'Selecionar Dia de Pagamento',
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

    // Admin Users
    teacherAccount: 'Conta de Professor',
    adminAccount: 'Conta de Admin',
    enterFullName: 'Digite o nome completo',
    enterEmailAddress: 'Digite o endereço de email',
    userStatus: 'Status',
    activeUser: 'Usuário',
    pendingSignup: 'Cadastro Pendente',
    copyLink: 'Copiar Link',
    confirmDelete: 'Tem certeza que deseja excluir {name} ({email})?',
    signupLinkCopied: 'Link de cadastro copiado',
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
    copy: 'Copiar',
  }
};

export const useTranslation = (language: Language) => {
  return translations[language];
}; 