const { GoogleGenerativeAI } = require("@google/generative-ai");
const Parser = require("rss-parser");
const fs = require("fs");
const path = require("path");

// Maskujemy bota i ustawiamy 5 sekund limitu czasu na każdą gazetę
const parser = new Parser({
  timeout: 5000, 
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  }
});
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });

const RSS_FEEDS = [
  "http://feeds.bbci.co.uk/news/world/rss.xml", // BBC
  "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", // NYT
  "https://www.theguardian.com/world/rss", // The Guardian
  "https://www.rmf24.pl/feed", // RMF24 - przyjazny botom
  "https://www.polsatnews.pl/rss/wszystkie.xml" // Polsat News
];

async function fetchAllNews() {
  let allNews = [];
  for (const url of RSS_FEEDS) {
    console.log(`[RSS] Próbuję pobrać: ${url}...`);
    try {
      // Twardy Kill Switch - wyścig między pobieraniem a stoperem (5 sekund)
      const feed = await Promise.race([
        parser.parseURL(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Serwer nie odpowiada - odcinam!")), 5000))
      ]);
      
      const topItems = feed.items.slice(0, 5).map(item => ({
        title: item.title,
        source: feed.title,
        snippet: item.contentSnippet || item.content || ""
      }));
      allNews = allNews.concat(topItems);
      console.log(`[RSS] SUKCES: Pobrane z ${url}`);
    } catch (error) {
      console.log(`[RSS] OMIJAM ${url} - powód: ${error.message}`);
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
    markdownContent = markdownContent.replace(/^```markdown\n/, "").replace(/\n```$/, "");

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
