/**
 * Default instructions sent to the external bid API (and embedded in the template テスト文).
 * Adjust when your 本番 API の仕様 is fixed.
 */
export const DEFAULT_BID_PROMPTS = `求人の入札文向けの指示:
ロボット的にせず、人間的で自然な日本語のトーンにしてください。箇条書きやダッシュは使わず、段落形式で。挨拶から始め、依頼内容の理解、経験、進め方、最後に締めの一文を入れてください。`;
