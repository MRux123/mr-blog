const { GoogleGenerativeAI } = require("@google/generative-ai");
const Parser = require("rss-parser");
const fs = require("fs");
const path = require("path");

const parser = new Parser();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Lista zaufanych źródeł RSS
const RSS_FEEDS = [
  "http://feeds.bbci.co.uk/news/world/rss.xml", // BBC
  "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", // NYT
  "https://www.theguardian.com/world/rss", // The Guardian
  "https://tvn24.pl/najnowsze.xml", // TVN24
  "https://wyborcza.pl/rss/1,82983.xml", // Wyborcza (Wiadomości)
  "https://www.polityka.pl/rss/" // Polityka
  // Uwaga: Reuters wyłączył darmowe publiczne RSS, ale te 6 źródeł to potężna dawka wiedzy!
];

async function fetchAllNews() {
  let allNews = [];
  for (const url of RSS_FEEDS) {
    try {
      const feed = await parser.parseURL(url);
      // Bierzemy tylko 5 najnowszych newsów z każdego portalu, żeby nie zalać AI
      const topItems = feed.items.slice(0, 5).map(item => ({
        title: item.title,
        source: feed.title,
        snippet: item.contentSnippet || item.content || ""
      }));
      allNews = allNews.concat(topItems);
    } catch (error) {
      console.log(`Błąd pobierania z ${url}:`, error.message);
    }
  }
  return allNews;
}

async function generatePost() {
  console.log("Rozpoczynam misję: Pobieranie newsów...");
  const rawNews = await fetchAllNews();
  
  if (rawNews.length === 0) {
    console.log("Brak newsów do przetworzenia. Anuluję.");
    return;
  }

  console.log(`Pobrano ${rawNews.length} nagłówków. Wywołuję Gemini AI...`);

  const prompt = `
    Jesteś profesjonalnym redaktorem naczelnym. Oto lista najświeższych nagłówków ze światowych i polskich mediów (w formacie JSON):
    ${JSON.stringify(rawNews)}

    Twoje zadanie:
    1. Przeanalizuj te nagłówki.
    2. Wybierz 1 do 3 ABSOLUTNIE NAJWAŻNIEJSZYCH wydarzeń ze Świata i 1 do 3 najważniejszych wydarzeń z Polski. Pomiń mało istotne informacje, plotki i duplikaty.
    3. Napisz krótki, analityczny artykuł informacyjny W JĘZYKU ANGIELSKIM, który podsumowuje te wydarzenia. Pisz obiektywnie, w stylu profesjonalnego dziennikarstwa.
    4. Sformatuj wynik jako plik Markdown, przeznaczony dla systemu Decap CMS.

    WYMOGI FORMATOWANIA:
    - Na samej górze MUSI być Frontmatter YAML.
    - Frontmatter musi zawierać: title (krótki, przyciągający uwagę), date (dzisiejsza data w formacie ISO: ${new Date().toISOString()}), category (wpisz "News"), author (wpisz "AI Editor").
    - Użyj ## WORLD i ## POLAND jako głównych nagłówków w tekście.
    - Użyj wypunktowań (bullet points) do opisu poszczególnych newsów.
    
    Zwróć TYLKO gotowy kod Markdown, bez żadnych dodatkowych powitań czy komentarzy od AI.
  `;

  try {
    const result = await model.generateContent(prompt);
    let markdownContent = result.response.text();
    
    // Czasami AI dodaje znaczniki ```markdown na początku i końcu. Usuwamy je dla czystości.
    markdownContent = markdownContent.replace(/^```markdown\n/, "").replace/\n```$/, "");

    // Generowanie nazwy pliku
    const dateObj = new Date();
    const fileName = `${dateObj.toISOString().slice(0, 10)}-ai-news-${dateObj.getHours()}.md`;
    
    // Zapis do folderu (zakładam, że masz folder 'posts' lub 'news' w repozytorium)
    const dirPath = path.join(__dirname, 'posts');
    if (!fs.existsSync(dirPath)){
        fs.mkdirSync(dirPath);
    }
    
    const filePath = path.join(dirPath, fileName);
    fs.writeFileSync(filePath, markdownContent, 'utf-8');
    
    console.log(`SUKCES! Artykuł wygenerowany i zapisany jako: ${fileName}`);

  } catch (error) {
    console.error("Błąd AI:", error);
  }
}

generatePost();
