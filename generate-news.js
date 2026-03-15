const { GoogleGenerativeAI } = require("@google/generative-ai");
const Parser = require("rss-parser");
const fs = require("fs");
const path = require("path");

const parser = new Parser({
  timeout: 5000, 
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' }
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });

const RSS_FEEDS = [
  "http://feeds.bbci.co.uk/news/world/rss.xml",
  "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
  "https://www.theguardian.com/world/rss",
  "https://www.rmf24.pl/feed",
  "https://www.polsatnews.pl/rss/wszystkie.xml"
];

async function fetchAllNews() {
  let allNews = [];
  for (const url of RSS_FEEDS) {
    console.log(`[RSS] Próbuję pobrać: ${url}...`);
    try {
      const feed = await Promise.race([
        parser.parseURL(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000))
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
    process.exit(0);
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
    - Frontmatter musi zawierać: title (krótki, przyciągający uwagę), date (dzisiejsza data w formacie ISO: ${new Date().toISOString()}), category (wpisz "News"), author (wpisz "Michał Rukszan").
    - Użyj ## WORLD i ## POLAND jako głównych nagłówków w tekście.
    - Użyj wypunktowań (bullet points) do opisu poszczególnych newsów.
    
    Zwróć TYLKO gotowy kod Markdown, bez żadnych dodatkowych powitań czy komentarzy od AI.
  `;

  try {
    const result = await model.generateContent(prompt);
    let markdownContent = result.response.text();
    markdownContent = markdownContent.replace(/^```markdown\n/, "").replace(/\n```$/, "");

    // --- PARSOWANIE FRONTMATTERA ---
    let title = "AI News Update";
    let dateStr = new Date().toISOString();
    let author = "Michał Rukszan";
    let cleanBody = markdownContent;

    const fmMatch = markdownContent.match(/---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const fmText = fmMatch[1];
      const titleMatch = fmText.match(/title:\s*"?([^"\n]+)"?/);
      if (titleMatch) title = titleMatch[1];
      const dateMatch = fmText.match(/date:\s*"?([^"\n]+)"?/);
      if (dateMatch) dateStr = dateMatch[1];
      // Usuwamy Frontmatter, by zostawić czysty tekst do bazy
      cleanBody = markdownContent.replace(/---\n[\s\S]*?\n---\n*/, '').trim();
    }

    // --- GENEROWANIE DANYCH DLA BAZY ---
    // Szukamy pierwszego akapitu, żeby zrobić zajawkę (excerpt)
    let excerpt = cleanBody.split('\n').find(line => line.trim().length > 20 && !line.startsWith('#')) || "Daily news summary.";
    if (excerpt.length > 250) excerpt = excerpt.substring(0, 247) + "...";

    const dateObj = new Date();
    const slug = `${dateObj.toISOString().slice(0, 10)}-ai-news-${dateObj.getHours()}`;

    // --- 1. AKTUALIZACJA BAZY JSON ---
    const jsonPath = path.join(__dirname, 'baza-artykulow.json');
    if (fs.existsSync(jsonPath)) {
        const rawJson = fs.readFileSync(jsonPath, 'utf-8');
        let db = JSON.parse(rawJson);
        
        const newPost = {
            author: author,
            title: title,
            slug: slug,
            excerpt: excerpt,
            date: dateStr,
            body: cleanBody // baza-artykulow expects markdown body!
        };
        
        db.posts.unshift(newPost); // Dodajemy na sam szczyt bazy
        fs.writeFileSync(jsonPath, JSON.stringify(db, null, 2), 'utf-8');
        console.log(`Zaktualizowano plik baza-artykulow.json nowym wpisem!`);
    } else {
        console.log(`OSTRZEŻENIE: Nie znaleziono pliku baza-artykulow.json w ${__dirname}`);
    }

    // --- 2. ZAPIS PLIKU .MD (Dla Decap CMS) ---
    const fileName = `${slug}.md`;
    const dirPath = path.join(__dirname, 'posts');
    if (!fs.existsSync(dirPath)){ fs.mkdirSync(dirPath); }
    const filePath = path.join(dirPath, fileName);
    fs.writeFileSync(filePath, markdownContent, 'utf-8');
    
    console.log(`SUKCES! Artykuł wygenerowany i zapisany jako: ${fileName}`);
    process.exit(0);

  } catch (error) {
    console.error("Błąd AI:", error);
    process.exit(1);
  }
}

generatePost();
