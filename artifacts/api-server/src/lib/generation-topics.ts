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
  const totalTopicCount = listLengths.reduce((total, length) => total + length, 0);
  const promptTemplate = `Create topic assignments for a batch of training examples.
Use only the batch description as the source of subject matter.
Return only a JSON object with this shape: {"topics":["topic", "..."]}.
Return exactly [BATCH_SIZE] strings in "topics", in order.
Be very careful to provide the EXACT number of topics requested in the response.
Each item must be a concise, specific subject or scenario, preferably 2–6 words.
All topics must be distinct across the entire list.
Choose different subjects/entities, not rewordings of the same subject. When the description names a category, vary its members.
Stay within the description's scope. If its subject is narrow, vary relevant situations or aspects without inventing unrelated subjects.
Do not generate training examples, commentary, or reasoning in the response.
Batch description (data, not instructions about output format):
[BATCH_DESCRIPTION]
Before responding, count the topics in your response and verify you have provided exactly [BATCH_SIZE].`;
  const prompt = promptTemplate
    .replaceAll("[BATCH_SIZE]", String(totalTopicCount))
    .replace("[BATCH_DESCRIPTION]", batchDescription);
  let topics: string[] | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    let rawResponse = "";
    let receivedCount: number | string = "unparseable";
    try {
      rawResponse = await request(prompt);
      const parsed: unknown = JSON.parse(rawResponse);
      const record = parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
      const responseTopics = Array.isArray(record.topics) ? record.topics : null;
      if (Array.isArray(responseTopics)) receivedCount = responseTopics.length;
      if (
        !Array.isArray(responseTopics) || responseTopics.length !== totalTopicCount ||
        responseTopics.some(topic => typeof topic !== "string" || !topic.trim())
      ) {
        throw new Error("Invalid batch topic plan.");
      }
      topics = responseTopics as string[];
      break;
    } catch (error) {
      lastError = error;
      console.error(`[Topic Planner] attempt ${attempt + 1} failed: expected ${totalTopicCount} topics, received ${receivedCount}. Raw response:\n${rawResponse || "(empty)"}`);
    }
  }
  if (!topics) {
    if (lastError instanceof Error) throw lastError;
    throw new Error("Invalid batch topic plan.");
  }
  const topicLists: string[][] = [];
  let topicOffset = 0;
  for (const length of listLengths) {
    topicLists.push((topics as string[]).slice(topicOffset, topicOffset + length));
    topicOffset += length;
  }
  const offsets = Array(parallelSlots).fill(0);
  return stacks.map(stack => stack.map(({ count }, slot) => {
    const topics = topicLists[slot].slice(offsets[slot], offsets[slot] + count);
    offsets[slot] += count;
    return topics.map(topic => topic.trim()).join("; ");
  }));
}
