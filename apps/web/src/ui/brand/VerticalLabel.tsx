import './brand.css'

/** 名義 ("the name on the account") and "confirm who you pay", set vertically as on the landing page. */
export function VerticalLabel() {
  return (
    <p className="vlabel" lang="ja">
      <span className="vlabel__name">
        名義
        <span className="vlabel__seal" aria-hidden="true" />
      </span>
      <span className="vlabel__line">支払先を、確かめる。</span>
    </p>
  )
}
