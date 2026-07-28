export default function ErrorState({
  message = "Daten konnten nicht geladen werden.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="bg-bg-card border border-loss/40 rounded-card px-4 md:px-6 py-4 md:py-5 text-sm space-y-2">
      <p className="text-loss">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-xs text-gold hover:underline"
        >
          Erneut versuchen
        </button>
      )}
    </div>
  );
}
