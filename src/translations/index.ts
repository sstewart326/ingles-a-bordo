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
  
  // Schedule
  courseSchedule: string;
  scheduleDescription: string;
  previousMonth: string;
  nextMonth: string;
  weeklyScheduleSummary: string;
  studentsLabel: string;
  
  // Class Materials
  classMaterialsTitle: string;
  selectMonthLabel: string;
  selectDateLabel: string;
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
    
    // Schedule
    courseSchedule: 'Course Schedule',
    scheduleDescription: 'View and manage your class schedule.',
    previousMonth: 'Previous Month',
    nextMonth: 'Next Month',
    weeklyScheduleSummary: 'Weekly Schedule Summary',
    studentsLabel: 'Students',
    
    // Class Materials
    classMaterialsTitle: 'Class Materials',
    selectMonthLabel: 'Select Month',
    selectDateLabel: 'Select Date',
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
    success: 'Success'
  },
  'pt-BR': {
    // Auth & Profile
    login: 'Entrar',
    signup: 'Cadastrar',
    logout: 'Sair',
    profile: 'Perfil',
    name: 'Nome',
    email: 'E-mail',
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
    manageSchedules: 'Gerenciar Agendas',
    manageMaterials: 'Gerenciar Materiais',
    
    // Dashboard
    quickActions: 'Ações Rápidas',
    manageScheduleDesc: 'Criar ou editar sessões de aula',
    classMaterialsDesc: 'Enviar e gerenciar materiais',
    upcomingClasses: 'Próximas Aulas',
    pastClasses: 'Aulas Anteriores',
    viewAll: 'Ver Todas',
    yourUpcomingClasses: 'Suas Próximas Aulas',
    sunday: 'Domingo',
    monday: 'Segunda-feira',
    tuesday: 'Terça-feira',
    wednesday: 'Quarta-feira',
    thursday: 'Quinta-feira',
    friday: 'Sexta-feira',
    saturday: 'Sábado',
    class: 'Aula',
    
    // Schedule
    courseSchedule: 'Agenda do Curso',
    scheduleDescription: 'Visualize e gerencie sua agenda de aulas.',
    previousMonth: 'Mês Anterior',
    nextMonth: 'Próximo Mês',
    weeklyScheduleSummary: 'Resumo Semanal',
    studentsLabel: 'Alunos',
    
    // Class Materials
    classMaterialsTitle: 'Materiais de Aula',
    selectMonthLabel: 'Selecionar Mês',
    selectDateLabel: 'Selecionar Data',
    pleaseLogin: 'Por favor, faça login para ver seus materiais de aula.',
    failedToLoad: 'Falha ao carregar materiais de aula',
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
    success: 'Sucesso'
  }
};

export const useTranslation = (language: Language) => {
  return translations[language];
}; 