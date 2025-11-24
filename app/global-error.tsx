'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <h2>Something went wrong.</h2>

        <p>{error.message}</p>

        <button
          onClick={() => reset()}
          style={{
            padding: "8px 16px",
            marginTop: "12px",
            background: "black",
            color: "white",
            borderRadius: "4px",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
