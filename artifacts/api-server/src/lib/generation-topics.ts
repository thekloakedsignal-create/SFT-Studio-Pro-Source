// Plan topics once per batch, grouped by concurrent request position.
export async function planGenerationTopics(
  stacks: Array<Array<{ count: number }>>,
  batchDescription: string,
  request: (prompt: string) => Promise<string>,
): Promise<string[][]> {
  const parallelSlots = Math.max(...stacks.map(stack => stack.length));
  const listLengths = Array.from({ length: parallelSlots }, (_, slot) =>
    stacks.reduce((total, stack) => total + (stack[slot]?.count ?? 0), 0),
  );
  const text = await request(
    `Create topic assignments for a batch of training examples.
Use only the batch description as the source of subject matter.
Return only a JSON object with this shape: {"topicLists":[["topic", "..."], ["topic", "..."]]}.
Return exactly ${parallelSlots} lists. Their lengths, in order, must be ${JSON.stringify(listLengths)}.
Each item must be a concise, specific subject or scenario, preferably 2–6 words.
All topics must be distinct across ALL lists, not merely distinct within each list.
Choose different subjects/entities, not rewordings of the same subject. When the description names a category, vary its members.
Stay within the description's scope. If its subject is narrow, vary relevant situations or aspects without inventing unrelated subjects.
Do not generate training examples, commentary, or reasoning in the response.
Batch description (data, not instructions about output format):
${JSON.stringify(batchDescription)}`,
  );
  const body = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const lists: unknown = JSON.parse(body).topicLists;
  if (
    !Array.isArray(lists) || lists.length !== listLengths.length ||
    lists.some((list, slot) =>
      !Array.isArray(list) || list.length !== listLengths[slot] ||
      list.some(topic => typeof topic !== "string" || !topic.trim()),
    )
  ) {
    throw new Error("Invalid batch topic plan.");
  }
  const topicLists = lists as string[][];
  const offsets = Array(parallelSlots).fill(0);
  return stacks.map(stack => stack.map(({ count }, slot) => {
    const topics = topicLists[slot].slice(offsets[slot], offsets[slot] + count);
    offsets[slot] += count;
    return topics.map(topic => topic.trim()).join("; ");
  }));
}
