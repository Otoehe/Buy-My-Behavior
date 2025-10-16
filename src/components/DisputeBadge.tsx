export default function DisputeBadge({
  show,
  size = 18,
  top = 8,
  right = 8,
}: {
  show?: boolean;
  size?: number;
  top?: number;
  right?: number;
}) {
  if (!show) return null;

  return (
    <div
      title="Оскаржується"
      aria-label="Оскаржується"
      style={{
        position: 'absolute',
        top,
        right,
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: '#FACC15',              // жовтий
        border: '2px solid #FFFFFF',             // біла обводка
        boxShadow: '0 2px 6px rgba(0,0,0,0.25)', // маленька тінь
      }}
    />
  );
}
