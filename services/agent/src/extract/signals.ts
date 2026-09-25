/**
 * Cheap deterministic signals that a document is trying to steer an AI reader or rush a human. They never
 * clear a payment; they only add reasons to hold one. The System-1 triage asks the same questions with a
 * calibrated model; these patterns are the floor that works with no model at all.
 */

const INJECTION: RegExp[] = [
  /ignore\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|messages?|rules)/iu,
  /disregard\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above|earlier)/iu,
  /\b(?:system|developer)\s+(?:prompt|message|notice|override|instructions?)\b/iu,
  /\bnotice\s+(?:to|for)\s+(?:the\s+)?(?:ai|llm|automated)\b/iu,
  /\b(?:note|instructions?|message)\s+(?:to|for)\s+(?:the\s+)?(?:ai|llm|assistant|agent|model)s?\b/iu,
  /\b(?:ai|llm)\s+(?:accounts?[-\s]payable\s+)?(?:assistant|agent|model)s?\b[^\n]{0,80}\b(?:must|should|shall|are\s+instructed)\b/iu,
  /\byou\s+are\s+now\b/iu,
  /\bnew\s+instructions?\b/iu,
  /\bdo\s+not\s+(?:tell|mention|inform|disclose|notify)\b/iu,
  /(?:以前|これまで|上記|前)の(?:指示|命令|ルール)を(?:無視|破棄|忘れ)/u,
  /AI(?:アシスタント|エージェント|担当)?(?:へ|に|宛)(?:の)?(?:指示|注意|お知らせ|連絡|通知)/u,
  /システム(?:プロンプト|メッセージ|指示|通知)/u,
  /(?:人間|担当者|経理|上司)(?:に|へ)(?:は)?(?:伝え|知らせ|言わ|報告し)ないで/u,
];

const URGENCY =
  /(至急|緊急|大至急|本日中|今日中|直ちに|即日|内密|極秘|他言無用|\burgent(?:ly)?\b|\bimmediately\b|\basap\b|\bright away\b|\bconfidential\b|\bsecret\b)/iu;

/** The first phrase that looks like instructions aimed at an AI reader, or null. */
export function injectionPhrase(text: string): string | null {
  for (const pattern of INJECTION) {
    const match = pattern.exec(text);
    if (match) return match[0];
  }
  return null;
}

/** The first urgency or secrecy phrase, or null. */
export function urgencyPhrase(text: string): string | null {
  return URGENCY.exec(text)?.[0] ?? null;
}
