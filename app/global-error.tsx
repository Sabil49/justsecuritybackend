'use client';

export default function GlobalError({
  error,
}: {
  error: Error;
}) {
  return (
    <html>
      <body>
        <h2>Something went wrong.</h2>
        <p>{error.message}</p>
      </body>
    </html>
  );
}
