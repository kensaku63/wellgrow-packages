export interface QuestionHit {
  id: string;
  question: string;
  tags: string[];
  importance: number | null;
  similarity: number | null;
  latest_answer: string | null;
  latest_answer_at: string | null;
  updated_at: string | null;
}

export interface AnswerHit {
  answer_id: string;
  answer: string;
  answer_description: string | null;
  answer_source: string | null;
  similarity: number | null;
  answered_at: string;
  question_id: string;
  question: string;
}

export interface QuestionListItem {
  id: string;
  question: string;
  tags: string[];
  status: string;
  importance: number | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export function formatSearchResult(result: {
  questions: QuestionHit[];
  answers: AnswerHit[];
}): string {
  const parts: string[] = [];

  if (result.questions.length > 0) {
    parts.push(`## 質問 (${result.questions.length}件)`);
    for (const q of result.questions) {
      const tags = q.tags.length > 0 ? ` [${q.tags.join(", ")}]` : "";
      const answer = q.latest_answer
        ? `\n  最新回答: ${q.latest_answer}`
        : "";
      parts.push(`- **${q.question}**${tags}${answer}\n  ID: ${q.id}`);
    }
  }

  if (result.answers.length > 0) {
    parts.push(`## 回答 (${result.answers.length}件)`);
    for (const a of result.answers) {
      const desc = a.answer_description
        ? `\n  説明: ${a.answer_description}`
        : "";
      parts.push(
        `- **${a.question}**\n  回答: ${a.answer}${desc}\n  回答日: ${a.answered_at}`
      );
    }
  }

  if (parts.length === 0) {
    return "検索結果はありません。";
  }

  return parts.join("\n\n");
}

export function formatQuestionList(questions: QuestionListItem[]): string {
  if (questions.length === 0) {
    return "質問はありません。";
  }

  const lines: string[] = [`## 質問一覧 (${questions.length}件)`];

  for (const q of questions) {
    const tags = q.tags.length > 0 ? ` [${q.tags.join(", ")}]` : "";
    const pinned = q.pinned ? " 📌" : "";
    const status = q.status !== "active" ? ` (${q.status})` : "";
    lines.push(
      `- **${q.question}**${tags}${pinned}${status}\n  ID: ${q.id} | 更新: ${q.updated_at}`
    );
  }

  return lines.join("\n\n");
}
