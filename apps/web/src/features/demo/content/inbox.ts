// The inbox around the story: routine, already-read mail, so the new messages have something to arrive into.
// Props only; none of it is read by the agent.

export interface InboxRow {
  readonly id: string
  readonly from: string
  readonly subject: string
  readonly snippet: string
  readonly time: string
}

export const READ_MAIL: readonly InboxRow[] = [
  {
    id: 'po',
    from: '購買部 田中',
    subject: '発注書 PO-2026-0412 承認済み',
    snippet: '10月納品分の発注書を承認しました。ご確認ください。',
    time: '17:58',
  },
  {
    id: 'saas',
    from: 'クラウド会計サービス',
    subject: '【領収書】9月分ご利用料金',
    snippet: 'いつもご利用ありがとうございます。9月分の領収書を発行しました。',
    time: '15:21',
  },
  {
    id: 'mall',
    from: 'ECモール 出店者サポート',
    subject: '9月度 ご請求書のご案内',
    snippet: '9月度のご請求書をマイページに掲載しました。',
    time: '11:04',
  },
  {
    id: 'note',
    from: '総務部',
    subject: '10月の棚卸しスケジュールについて',
    snippet: '来週水曜の棚卸しは午前中に実施します。',
    time: '9月24日',
  },
]

export const MAILBOX = {
  owner: 'ap@haruka-seisakusho.example',
  company: 'ハルカ製作所',
  host: 'mail.haruka-seisakusho.example',
  tab: 'Inbox – Haruka Seisakusho',
} as const
