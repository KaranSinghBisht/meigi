import './register.css'

const CHECKS = [
  {
    title: 'NTA exact match',
    body: 'The legal name must match the National Tax Agency record character for character. Look-alike names are refused.',
  },
  {
    title: 'Domain proof',
    body: 'Your business key signs a challenge that you publish as a DNS TXT record on the company domain.',
  },
  {
    title: 'World ID officers',
    body: "Each officer proves they're a unique human. Only those same sessions can approve changes later.",
  },
  {
    title: 'On-chain, never overwritten',
    body: 'The attester writes the payee on Sepolia. A second claim freezes it as disputed instead of replacing it.',
  },
] as const

/** Why each step exists, next to the wizard. */
export function Checklist({ current }: { readonly current: number }) {
  return (
    <aside className="checklist" aria-labelledby="checklist-title">
      <h2 id="checklist-title" className="checklist__title">
        What Meigi checks
      </h2>
      <ol className="checklist__list">
        {CHECKS.map((check, index) => (
          <li key={check.title} className={index === current ? 'checklist__item is-current' : 'checklist__item'}>
            <span className="checklist__num" aria-hidden="true">
              {index + 1}
            </span>
            <span className="checklist__text">
              <span className="checklist__name">{check.title}</span>
              <span className="checklist__body">{check.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </aside>
  )
}
