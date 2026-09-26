import type { HexAddress } from '../../../lib/env/env'
import { Address } from '../../../ui/components/Address'
import { Badge } from '../../../ui/components/Badge'
import { Button } from '../../../ui/components/Button'
import { Notice } from '../../../ui/components/Notice'
import { backupFileName } from './backup'
import { useNewPayoutWallet } from './useNewPayoutWallet'

interface NewPayoutWalletProps {
  /** The wallet made earlier, whose backup was downloaded; null before that. */
  readonly saved: HexAddress | null
  readonly onSaved: (address: HexAddress | null) => void
}

function Saved({ address, onDiscard }: { readonly address: HexAddress; readonly onDiscard: () => void }) {
  return (
    <div className="onboard-cell new-wallet">
      <p className="new-wallet__chips">
        <Badge tone="info">Testnet demo wallet</Badge>
        <Badge tone="active">Backup saved</Badge>
      </p>
      <Address value={address} copy />
      <p className="new-wallet__note">
        Its key is in <span className="mono">{backupFileName(address)}</span>. This page kept no copy.
      </p>
      <div className="new-wallet__actions">
        <Button variant="quiet" size="sm" onClick={onDiscard}>
          Create a different wallet
        </Button>
      </div>
    </div>
  )
}

/** Create a payout wallet here; the reader can't continue until its one backup file is downloaded. */
export function NewPayoutWallet({ saved, onSaved }: NewPayoutWalletProps) {
  const wallet = useNewPayoutWallet(onSaved)
  if (saved && !wallet.pending) return <Saved address={saved} onDiscard={() => onSaved(null)} />
  if (!wallet.pending) {
    return (
      <div className="onboard-cell new-wallet">
        <p className="new-wallet__note">
          The key is made in this browser and never leaves your device. You download it once, as a backup file.
        </p>
        <div className="new-wallet__actions">
          <Button variant="ghost" onClick={wallet.create}>
            Create wallet
          </Button>
        </div>
      </div>
    )
  }
  return (
    <div className="onboard-cell new-wallet">
      <p className="new-wallet__chips">
        <Badge tone="info">Testnet demo wallet</Badge>
      </p>
      <Address value={wallet.pending} link={false} copy />
      <Notice tone="warn" title="Download the backup to continue.">
        <p>The key exists only in this tab and is never stored. You can download it once; without the file, nobody can move this wallet's funds.</p>
      </Notice>
      {wallet.error ? (
        <p className="field__error" role="alert">
          {wallet.error}
        </p>
      ) : null}
      <div className="new-wallet__actions">
        <Button onClick={wallet.download}>Download backup</Button>
      </div>
    </div>
  )
}
