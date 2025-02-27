# Inglés a Bordo 🚀

A modern web application built with React and Firebase for managing learning resources and scheduling.

## 🌟 Features

- User authentication and authorization
- Real-time data synchronization with Firebase
- Responsive design using Tailwind CSS
- Multi-language support
- Course management system
- Scheduling and booking system
- Modern and intuitive user interface

## 🛠️ Tech Stack

- **Frontend Framework**: React 19
- **Type Safety**: TypeScript
- **Styling**: Tailwind CSS
- **Backend/Database**: Firebase
  - Firestore
  - Firebase Authentication
  - Firebase Storage
  - Firebase Functions
- **State Management**: React Query (TanStack Query)
- **Routing**: React Router v7
- **Development Tools**:
  - Vite
  - ESLint
  - PostCSS
  - TypeScript

## 📦 Prerequisites

- Node.js (LTS version recommended)
- npm or yarn
- Firebase account and project setup

## 🚀 Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/ingles-a-bordo.git
   cd ingles-a-bordo
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   - Copy `.env.example` to `.env.local`
   - Fill in your Firebase configuration details

4. **Start the development server**
   ```bash
   npm run dev
   ```

## 🔧 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

## 📁 Project Structure

```
ingles-a-bordo/
├── src/
│   ├── assets/        # Static assets
│   ├── components/    # Reusable components
│   ├── config/        # Configuration files
│   ├── contexts/      # React contexts
│   ├── hooks/         # Custom React hooks
│   ├── pages/         # Page components
│   ├── translations/  # i18n translations
│   └── utils/         # Utility functions
├── public/            # Public assets
├── functions/         # Firebase Cloud Functions
└── firebase-data/     # Firebase related data
```

## 🔒 Environment Variables

Required environment variables:

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

## 📄 License

This project is licensed under the terms of the license included in the repository.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
