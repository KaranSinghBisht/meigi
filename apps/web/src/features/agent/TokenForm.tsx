import { useState, type FormEvent } from 'react'
import { saveAgentToken } from '../../lib/api/agentAuth'
import { Button } from '../../ui/components/Button'
import { TextField } from '../../ui/components/Field'
import './agent.css'

/** Shown when the agent answers 401: the operator enters AGENT_API_TOKEN, then the request is retried. */
export function TokenForm({ onSaved }: { readonly onSaved: () => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const token = value.trim()
    if (token.length < 16) {
      setError('The agent token is at least 16 characters.')
      return
    }
    saveAgentToken(token)
    setValue('')
    onSaved()
  }
  return (
    <form className="token" onSubmit={submit}>
      <TextField
        label="Operator token (AGENT_API_TOKEN)"
        type="password"
        autoComplete="off"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        error={error}
      />
      <Button type="submit">Save and retry</Button>
    </form>
  )
}
