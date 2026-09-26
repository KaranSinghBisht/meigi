import { useRef, type ChangeEvent } from 'react'
import type { HexAddress } from '../../../lib/env/env'
import { Address } from '../../../ui/components/Address'
import { Badge } from '../../../ui/components/Badge'
import { Button } from '../../../ui/components/Button'
import { Notice } from '../../../ui/components/Notice'
import { backupFileName } from './backup'
import type { NewPayoutWallet as Wallet, UnsavedWallet } from './useNewPayoutWallet'

interface NewPayoutWalletProps {
  readonly wallet: Wallet
  /** The wallet made earlier whose backup was saved; null before that. */
  readonly saved: HexAddress | null
  readonly onDiscard: () => void
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

/** Saved through a plain download, which a page can't see land: choosing the file back proves it is there. */
function ConfirmDownload({ wallet, unsaved }: { readonly wallet: Wallet; readonly unsaved: UnsavedWallet }) {
  const input = useRef<HTMLInputElement>(null)
  const chosen = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void wallet.confirm(file)
  }
  return (
    <>
      <Notice
        tone="info"
        title={
          <span>
            Check your downloads for <span className="mono">{backupFileName(unsaved.address)}</span>.
          </span>
        }
      >
        <p>Choose that file to confirm it saved. This page then forgets the key for good.</p>
      </Notice>
      <div className="new-wallet__actions">
        <Button onClick={() => input.current?.click()}>Choose the saved file</Button>
        <Button variant="quiet" busy={wallet.saving} onClick={() => void wallet.save()}>
          Download again
        </Button>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={chosen}
        />
      </div>
    </>
  )
}

/** A wallet with a key in memory and no backup yet: its address is shown, but not offered for copying. */
function Unsaved({ wallet, unsaved }: { readonly wallet: Wallet; readonly unsaved: UnsavedWallet }) {
  return (
    <div className="onboard-cell new-wallet">
      <p className="new-wallet__chips">
        <Badge tone="info">Testnet demo wallet</Badge>
      </p>
      <Address value={unsaved.address} link={false} />
      {unsaved.downloaded ? (
        <ConfirmDownload wallet={wallet} unsaved={unsaved} />
      ) : (
        <>
          <Notice tone="warn" title="Save the backup to continue.">
            <p>The key exists only in this tab and is never stored. Without the file, nobody can move this wallet's funds.</p>
          </Notice>
          <div className="new-wallet__actions">
            <Button busy={wallet.saving} onClick={() => void wallet.save()}>
              Download backup
            </Button>
          </div>
        </>
      )}
      {wallet.error ? (
        <p className="field__error" role="alert">
          {wallet.error}
        </p>
      ) : null}
    </div>
  )
}

/** Create a payout wallet here; the reader can't continue until its one backup file is saved. */
export function NewPayoutWallet({ wallet, saved, onDiscard }: NewPayoutWalletProps) {
  if (wallet.unsaved) return <Unsaved wallet={wallet} unsaved={wallet.unsaved} />
  if (saved) return <Saved address={saved} onDiscard={onDiscard} />
  return (
    <div className="onboard-cell new-wallet">
      <p className="new-wallet__note">
        The key is made in this browser and never leaves your device. You save it once, as a backup file.
      </p>
      <div className="new-wallet__actions">
        <Button variant="ghost" onClick={wallet.create}>
          Create wallet
        </Button>
      </div>
    </div>
  )
}
