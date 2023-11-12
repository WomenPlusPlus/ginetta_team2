import {
  StreamingTextResponse,
  Message,
  experimental_StreamData,
  createStreamDataTransformer,
} from "ai";
import { AIMessage, HumanMessage, SystemMessage } from "langchain/schema";
import { ChatOllama } from "langchain/chat_models/ollama";
import { BytesOutputParser } from "langchain/schema/output_parser";
import { searchVectorDB } from "./vector-db";

export async function POST(req: Request) {
  const languages = ['en', 'de', 'fr']
  const language = 'en'
  const location = 'Zurich'
  const frontend_tones = ['expert', 'no-expert']
  const frontend_tone = 'expert'

  const { messages } = (await req.json()) as { messages: Message[] };

  const contextSearchModel = new ChatOllama({
    baseUrl: process.env.OLLAMA_BASE_URL,
    model: process.env.OLLAMA_MODEL_NAME,
    temperature: 0,
  });

  const chatModel = new ChatOllama({
    baseUrl: process.env.OLLAMA_BASE_URL,
    model: process.env.OLLAMA_MODEL_NAME,
    temperature: 0.5,
  });

  const data = new experimental_StreamData();

  const reasked_questions = {'en': "Given the following conversation and a follow-up question, rephrase the follow-up question to be a standalone keyword-based question. Reply only with the question, nothing else.",
    'de': "Formulieren Sie bei der folgenden Konversation und einer Folgefrage die Folgefrage so um, dass sie eine eigenständige stichwortbasierte Frage ist. Beantworten Sie nur die Frage, sonst nichts.",
  'fr': "A partir de la conversation suivante et d'une question de suivi, reformulez la question de suivi pour en faire une question autonome basée sur des mots-clés. Ne répondez qu'à la question, rien d'autre."}
  const reasked_question = reasked_questions[language]

  // Extract a standalone question to later query the vector db.
  const answer = await contextSearchModel.call(
    parseMessages([
      ...messages,
      {
        id: "0",
        role: "system",
        content: reasked_question + `
----------
Standalone question:`,
      },
    ])
  );
  console.log("\n====================================");
  console.log("Standalone question:", answer.content);

  let systemInstructions = "";

  // Get the standalone question and search the vector db.
  const topDocumentsLimit = 3;
  const context = await searchVectorDB(answer.content, topDocumentsLimit);

  data.append(JSON.stringify({ context }));

  console.log("context =", context.length)
  console.log("context =", context[0].payload)

  const contextString = context
    .map(
      (x) => `
## ${x?.payload?.article}
${x?.payload?.content}

---

[Source link](${x?.payload?.link})
`
    )
    .join("----\n");

  console.log("Context String:", contextString);


  const tones = {'en': {
      'expert': `Consider you are talking to a expert lawyer who lives in ${location}`,
      'no-expert': `Consider you are talking to a layman who lives in ${location}.`},
  'de': {'expert': `Stellen Sie sich vor, Sie sprechen mit einem Fachanwalt, der in ${location} lebt.`,
        'no-expert': `Nehmen wir an, Sie sprechen mit einem Laien, der in ${location} lebt.`},
  'fr': {'expert': `Considérez que vous vous adressez à un avocat spécialisé qui vit à ${location}.`,
          'no-expert': `Considérez que vous vous adressez à un profane qui vit à ${location}.`}}

  const tone = tones[language][frontend_tone]

  const user_profiles = {'en': "You are a legal assistant expert on the Swiss Code of Obligations. " +
        "Answer questions related to contract law, employment regulations, or corporate obligations. " +
        `Base your answers exclusively on the provided top ${topDocumentsLimit} articles from the Swiss ` +
        `Code of Obligations. Please provide a summary of the relevant article(s), along with the source link(s) for ` +
        "reference. If an answer is not explicitly covered in the provided context, please indicate so. " + tone,
    'de': "Sie sind juristische Mitarbeiterin und Expertin für das Schweizerische Obligationenrecht. " +
        "Beantworten Sie Fragen zum Vertragsrecht, zum Arbeitsrecht oder zu unternehmerischen Pflichten. " +
        `Stützen Sie sich bei Ihren Antworten ausschliesslich auf die angegebenen Top ${topDocumentsLimit} ` +
        "Artikel des Schweizerischen Obligationenrechts. Bitte geben Sie eine Zusammenfassung des/der relevanten " +
        "Artikel(s) sowie den/die Quellenlink(s) als Referenz an. Falls eine Antwort nicht explizit im vorgegebenen" +
        " Kontext abgedeckt ist, geben Sie dies bitte an." + tone,
    'fr': "Vous êtes une assistante juridique experte en Code des obligations suisse. Répondez aux questions relatives " +
        "au droit des contrats, au droit du travail ou aux obligations des entreprises. Basez vos réponses exclusivement " +
        `sur les articles top ${topDocumentsLimit} du Code suisse des obligations. Veuillez fournir un résumé de l'article ` +
        "ou des articles concernés, ainsi que le(s) lien(s) source(s) pour référence. Si une réponse n'est pas" +
        " explicitement couverte par le contexte fourni, veuillez l'indiquer." + tone
  }
  const user_profile = user_profiles[language]


  systemInstructions = user_profile + `
----

CONTEXT: ${contextString}`;

  console.log('systemInstructions =', systemInstructions)

  // Call and stream the LLM with the instructions, context and user messages.
  const stream = await chatModel
    .pipe(new BytesOutputParser())
    .stream(
      parseMessages([
        { id: "instructions", role: "system", content: systemInstructions },
        ...messages,
      ]),
      { callbacks: [{ handleLLMEnd: () => data.close() }] }
    );

  const result = new StreamingTextResponse(
    stream.pipeThrough(createStreamDataTransformer(true)),
    {},
    data
  );

    const streamSummary = parseMessages([{ id: "instructions",
    role: "system", content: systemInstructions }, ...messages,]);

  return result
}


function parseMessages(messages: Message[]) {
  console.log('messages =', messages)
  messages.forEach(m => {if (m.role == "assistant") {
    console.log('ai message ', m.content)
  }}
  );
  const parsedMessages = messages.map((m) =>
    m.role == "user"
      ? new HumanMessage(m.content)
      : m.role == "system"
      ? new SystemMessage(m.content)
      : new AIMessage(m.content)
  );

  return parsedMessages;
}