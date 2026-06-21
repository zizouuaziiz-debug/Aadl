export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <h1 className="text-3xl font-bold mb-4">AADL Telegram Bot</h1>
      <p className="text-gray-600 mb-6 text-center max-w-md">
        Backend service for the AADL notaire check bot. Telegram webhook runs at{' '}
        <code className="bg-gray-100 px-1 rounded">/api/webhook</code>.
      </p>
      <a
        href="/api/set-webhook"
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        Register Telegram Webhook
      </a>
    </main>
  );
}
