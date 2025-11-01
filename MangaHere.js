// MangaHere Source for Vorp
// Website: https://www.mangahere.cc
// Note: This uses fetch and basic parsing

const BASE_URL = "https://www.mangahere.cc";

// ============================================================================
// SEARCH FUNCTION
// ============================================================================
async function searchManga(keyword) {
    try {
        const searchUrl = `${BASE_URL}/search?title=${encodeURIComponent(keyword)}`;
        const response = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
            }
        });
        
        const html = await response.text();
        
        // Parse HTML to extract manga results
        const results = [];
        
        // Look for manga cards/items with links
        // Try multiple patterns to catch different layouts
        const patterns = [
            // Pattern 1: Common manga card structure
            /<a[^>]*href="([^"]*\/manga\/[^"]+)"[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi,
            // Pattern 2: Alternative structure
            /<li[^>]*>[\s\S]*?<a[^>]*href="([^"]*\/manga\/[^"]+)"[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi,
            // Pattern 3: Simple link pattern
            /<a[^>]*href="([^"]*\/manga\/[^"]+)"[^>]*class="[^"]*book"[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi
        ];
        
        const foundIds = new Set(); // Prevent duplicates
        
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(html)) !== null && results.length < 50) {
                const href = match[1].startsWith('http') ? match[1] : BASE_URL + match[1];
                const image = match[2].startsWith('http') ? match[2] : BASE_URL + match[2];
                const title = match[3].replace(/\s+/g, ' ').trim();
                
                // Extract ID from href (e.g., /manga/onepunch_man/)
                const idMatch = href.match(/\/manga\/([^\/]+)/);
                if (!idMatch) continue;
                
                const id = idMatch[1];
                
                // Skip duplicates
                if (foundIds.has(id)) continue;
                foundIds.add(id);
                
                results.push({
                    "id": id,
                    "title": title,
                    "image": image,
                    "href": href
                });
            }
        }
        
        return results;
    } catch (error) {
        console.error("MangaHere search error:", error);
        return [];
    }
}

// ============================================================================
// MANGA DETAILS FUNCTION
// ============================================================================
async function getMangaDetails(manga) {
    try {
        // Ensure URL has trailing slash
        let mangaUrl = manga.href || `${BASE_URL}/manga/${manga.id}`;
        if (!mangaUrl.endsWith('/')) {
            mangaUrl += '/';
        }
        
        const response = await fetch(mangaUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
            }
        });
        
        const html = await response.text();
        
        // Extract author if present
        let author = manga.author;
        const authorMatch = html.match(/<span class="detail-info-right-say">[\s\S]*?Author[^<]*<a[^>]*>([^<]+)<\/a>/i);
        if (authorMatch) {
            author = authorMatch[1].trim();
        }
        
        // Extract description
        let description = "";
        const descPatterns = [
            /<span class="detail-info-content">([\s\S]*?)<\/span>/i,
            /<p class="detail-info">([\s\S]*?)<\/p>/i
        ];
        
        for (const pattern of descPatterns) {
            const descMatch = html.match(pattern);
            if (descMatch && descMatch[1]) {
                description = descMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
                if (description) break;
            }
        }
        
        // Extract chapters - MangaHere uses /manga/name/c123/ format
        const chapters = [];
        const chapterPatterns = [
            // Pattern for chapter links
            /<a[^>]*href="([^"]*\/manga\/[^"]+\/c\d+\/[^"]*)"[^>]*>[\s\S]*?([^<]+)<\/a>/gi,
            /<li[^>]*>[\s\S]*?<a[^>]*href="([^"]*\/manga\/[^"]+\/c\d+\/[^"]*)"[^>]*>[\s\S]*?([^<]+)<\/a>/gi
        ];
        
        const foundChapters = new Set();
        
        for (const pattern of chapterPatterns) {
            let chapterMatch;
            while ((chapterMatch = pattern.exec(html)) !== null) {
                const href = chapterMatch[1].startsWith('http') ? chapterMatch[1] : BASE_URL + chapterMatch[1];
                const title = chapterMatch[2].replace(/<[^>]*>/g, '').trim();
                
                // Extract chapter number from href (e.g., /c217/)
                const chapterNumMatch = href.match(/\/c(\d+)\//);
                if (!chapterNumMatch) continue;
                
                const chapterId = chapterNumMatch[1];
                
                // Skip duplicates
                if (foundChapters.has(chapterId)) continue;
                foundChapters.add(chapterId);
                
                // Extract number from title or ID
                const numberMatch = title.match(/ch?\.?\s*(\d+(?:\.\d+)?)/i);
                const chapterNumber = numberMatch ? parseFloat(numberMatch[1]) : parseFloat(chapterId);
                
                chapters.push({
                    "id": chapterId,
                    "title": title || `Chapter ${chapterNumber}`,
                    "chapterNumber": chapterNumber,
                    "href": href
                });
            }
        }
        
        // Sort chapters by number
        chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
        
        return {
            ...manga,
            "author": author || manga.author,
            "description": description || manga.description,
            "chapters": chapters
        };
    } catch (error) {
        console.error("MangaHere details error:", error);
        return {
            ...manga,
            "chapters": []
        };
    }
}

// ============================================================================
// CHAPTER PAGES FUNCTION
// ============================================================================
async function getChapterPages(chapter) {
    try {
        // MangaHere format: https://www.mangahere.cc/manga/onepunch_man/c217/1.html
        const chapterUrl = chapter.href;
        const response = await fetch(chapterUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
            }
        });
        
        const html = await response.text();
        
        const pages = [];
        
        // MangaHere chapter images - try multiple patterns
        const imagePatterns = [
            // Pattern 1: Direct manga page images
            /<img[^>]*src="([^"]*)"[^>]*class="manga-page"[^>]*>/gi,
            // Pattern 2: Image with onerror fallback
            /<img[^>]*src="([^"]*)"[^>]*onerror="[^"]*"[^>]*>/gi,
            // Pattern 3: Any img with mangahere in src
            /<img[^>]*src="([^"]*(?:mangahere|fmcdn\.mangahere)[^"]*)"[^>]*>/gi,
            // Pattern 4: All img tags (last resort)
            /<img[^>]*src="([^"]*(?:jpg|jpeg|png|webp)[^"]*)"[^>]*>/gi
        ];
        
        const foundUrls = new Set();
        
        for (const pattern of imagePatterns) {
            let imageMatch;
            while ((imageMatch = pattern.exec(html)) !== null && pages.length < 100) {
                const imageUrl = imageMatch[1];
                
                // Skip tiny images (likely icons/buttons)
                if (imageUrl.length < 20) continue;
                
                // Skip common non-content images
                if (imageUrl.includes('logo') || 
                    imageUrl.includes('button') || 
                    imageUrl.includes('icon') ||
                    imageUrl.includes('ad.')) continue;
                
                // Skip duplicates
                if (foundUrls.has(imageUrl)) continue;
                foundUrls.add(imageUrl);
                
                pages.push({
                    "url": imageUrl.startsWith('http') ? imageUrl : BASE_URL + imageUrl,
                    "pageNumber": pages.length + 1
                });
            }
            
            // Stop after first pattern that finds images
            if (pages.length > 0) break;
        }
        
        return pages;
    } catch (error) {
        console.error("MangaHere pages error:", error);
        return [];
    }
}

console.log("MangaHere source loaded successfully!");

