interface StatusMessageProps {
  type: 'success' | 'error' | 'pending';
  message: string;
  txHash?: string;
}

export function StatusMessage({ type, message, txHash }: StatusMessageProps) {
  return (
    <div class={`bsc-status ${type}`}>
      {type === 'pending' && <span class="bsc-spinner" style={{ marginRight: '8px' }}></span>}
      <span>{message}</span>
      {txHash && (
        <>
          {' '}
          <a
            class="bsc-tx-link"
            href={`https://bscscan.com/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View TX →
          </a>
        </>
      )}
    </div>
  );
}
