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
  addNewUser: string;
  generateSignupLink: string;
  paymentDue: string;

  // Days of Week - Short Names
  sundayShort: string;
  mondayShort: string;
  tuesdayShort: string;
  wednesdayShort: string;
  thursdayShort: string;
  fridayShort: string;
  saturdayShort: string;
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
    manageSchedules: 'Manage Schedules',
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
    addNewUser: 'Add New User',
    generateSignupLink: 'Generate Signup Link',
    paymentDue: 'Payment Due',

    // Days of Week - Short Names
    sundayShort: 'Sun',
    mondayShort: 'Mon',
    tuesdayShort: 'Tue',
    wednesdayShort: 'Wed',
    thursdayShort: 'Thu',
    fridayShort: 'Fri',
    saturdayShort: 'Sat',
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
    manageSchedules: 'Gerenciar Horários',
    manageMaterials: 'Gerenciar Materiais',
    
    // Dashboard
    quickActions: 'Ações Rápidas',
    manageScheduleDesc: 'Criar ou editar sessões de aula',
    classMaterialsDesc: 'Enviar e gerenciar materiais',
    upcomingClasses: 'Próximas Aulas',
    pastClasses: 'Aulas Passadas',
    viewAll: 'Ver Tudo',
    yourUpcomingClasses: 'Suas Próximas Aulas',
    sunday: 'Domingo',
    monday: 'Segunda',
    tuesday: 'Terça',
    wednesday: 'Quarta',
    thursday: 'Quinta',
    friday: 'Sexta',
    saturday: 'Sábado',
    class: 'Aula',
    noClassesScheduled: 'Não há aulas agendadas para este dia',
    students: 'Alunos',
    pair: 'Aula em Par',
    group: 'Aula em Grupo',
    
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
    classMaterialsTitle: 'Gerenciamento de Materiais',
    selectMonthLabel: 'Selecionar Mês',
    selectDateLabel: 'Selecionar Data',
    selectClass: 'Selecionar Aula em',
    uploadMaterials: 'Enviar Materiais',
    addLinkPlaceholder: 'Adicionar um link para materiais de aprendizagem',
    uploading: 'Enviando...',
    existingMaterials: 'Materiais Existentes',
    materialsForDate: 'Materiais para',
    selectDateWithClass: 'Selecione uma data com aula agendada para gerenciar materiais',
    pleaseLogin: 'Por favor, faça login para ver seus materiais de aula.',
    failedToLoad: 'Falha ao carregar materiais',
    usefulLinks: 'Links Úteis',
    noMaterialsFound: 'Nenhum material encontrado',
    downloadSlides: 'Baixar Slides',
    
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
    addNewUser: 'Adicionar Novo Usuário',
    generateSignupLink: 'Gerar Link de Cadastro',
    paymentDue: 'Pagamento Pendente',

    // Days of Week - Short Names
    sundayShort: 'Dom',
    mondayShort: 'Seg',
    tuesdayShort: 'Ter',
    wednesdayShort: 'Qua',
    thursdayShort: 'Qui',
    fridayShort: 'Sex',
    saturdayShort: 'Sáb',
  }
};

export const useTranslation = (language: Language) => {
  return translations[language];
}; 