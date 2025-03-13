import '../styles/globals.css'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="background-shapes">
          <div className="shape"></div>
          <div className="shape"></div>
          <div className="shape"></div>
        </div>
        {children}
      </body>
    </html>
  )
} 