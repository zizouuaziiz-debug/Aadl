export const metadata = {
  title: 'AADL Bot',
  description: 'Telegram bot backend for AADL notaire checks',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
