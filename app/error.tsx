'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div style={{ padding: "40px" }}>
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
    </div>
  );
}
