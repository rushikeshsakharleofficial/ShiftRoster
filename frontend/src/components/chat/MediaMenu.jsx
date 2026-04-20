import React, { useState, useEffect, lazy, Suspense } from "react";
import data from "@emoji-mart/data";
const Picker = lazy(() =>
  import("@emoji-mart/react").then((m) => ({ default: m.default ?? m.Picker }))
);
import axios from "axios";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Smile, Image as ImageIcon, Search, Loader2 } from "lucide-react";

const GIPHY_API_KEY = import.meta.env.REACT_APP_GIPHY_API_KEY;

function useAppTheme() {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains("dark"))
    );
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return isDark ? "dark" : "light";
}

export default function MediaMenu({ onEmojiSelect, onGifSelect, disabled, gifsEnabled = true }) {
  const [activeTab, setActiveTab] = useState("emojis");
  const [gifSearch, setGifSearch] = useState("");
  const [gifs, setGifs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const pickerTheme = useAppTheme();

  useEffect(() => {
    if (!gifsEnabled && activeTab === "gifs") {
      setActiveTab("emojis");
    }
  }, [gifsEnabled, activeTab]);

  useEffect(() => {
    if (!gifSearch) {
      if (activeTab === "gifs" && gifsEnabled) fetchTrendingGifs();
      return;
    }
    const timer = setTimeout(() => {
      if (gifsEnabled) searchGifs(gifSearch);
    }, 500);
    return () => clearTimeout(timer);
  }, [gifSearch, activeTab, gifsEnabled]);

  const fetchTrendingGifs = async () => {
    if (!GIPHY_API_KEY) return;
    setLoading(true);
    try {
      const res = await axios.get("https://api.giphy.com/v1/gifs/trending", {
        params: {
          api_key: GIPHY_API_KEY,
          limit: 20,
          rating: "g",
        },
      });
      setGifs(res.data.data);
    } catch (err) {
      console.error("Giphy trending error:", err);
    } finally {
      setLoading(false);
    }
  };

  const searchGifs = async (query) => {
    if (!GIPHY_API_KEY || !query) return;
    setLoading(true);
    try {
      const res = await axios.get("https://api.giphy.com/v1/gifs/search", {
        params: {
          api_key: GIPHY_API_KEY,
          q: query,
          limit: 20,
          rating: "g",
        },
      });
      setGifs(res.data.data);
    } catch (err) {
      console.error("Giphy search error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleGifSearchChange = (e) => {
    setGifSearch(e.target.value);
  };

  const handleEmojiClick = (emoji) => {
    onEmojiSelect(emoji.native);
    // Removed setOpen(false) to keep picker open for multiple selections
  };

  const handleGifClick = (gif) => {
    onGifSelect({
      url: gif.images.fixed_height.url,
      file_name: gif.title || "gif",
      file_size: 0,
      file_type: "image/gif",
    });
    setOpen(false);
  };

  const renderEmojiPicker = () => (
    <Suspense fallback={<div className="flex items-center justify-center h-[352px]"><span className="text-xs text-muted-foreground">Loading...</span></div>}>
      <Picker
        data={data}
        onEmojiSelect={handleEmojiClick}
        theme={pickerTheme}
        set="native"
        skinTonePosition="search"
        previewPosition="none"
        navPosition="bottom"
        perLine={8}
        maxFrequentRows={2}
        width="100%"
        autoFocus={true}
      />
    </Suspense>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-xl text-muted-foreground hover:bg-muted/80 shrink-0"
          disabled={disabled}
          title="Emojis & GIFs"
        >
          <Smile className="h-4.5 w-4.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[352px] p-0 overflow-hidden rounded-xl border border-border bg-background"
        style={{
          boxShadow: "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)",
          zIndex: 9999,
        }}
        align="start"
        side="top"
      >
        {gifsEnabled ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full overflow-hidden">
            <div className="px-3 py-2 flex items-center justify-between border-b border-border bg-card">
              <TabsList className="grid grid-cols-2 w-32 h-8">
                <TabsTrigger value="emojis" className="text-xs">
                  <Smile className="h-3 w-3 mr-1.5" /> Emojis
                </TabsTrigger>
                <TabsTrigger value="gifs" className="text-xs">
                  <ImageIcon className="h-3 w-3 mr-1.5" /> GIFs
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="emojis" className="m-0 border-none outline-none overflow-hidden" style={{ marginTop: 0 }}>
              {renderEmojiPicker()}
            </TabsContent>

            <TabsContent value="gifs" className="m-0 border-none outline-none p-3 space-y-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search Giphy..."
                  className="pl-8 h-8 text-sm bg-background/50"
                  value={gifSearch}
                  onChange={handleGifSearchChange}
                  autoFocus
                />
              </div>
              <ScrollArea className="h-[300px] pr-2">
                {loading ? (
                  <div className="flex flex-col items-center justify-center h-48 gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Loading GIFs...</p>
                  </div>
                ) : gifs.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 pb-2">
                    {gifs.map((gif) => (
                      <button
                        key={gif.id}
                        className="relative aspect-video rounded-md overflow-hidden hover:ring-2 ring-primary transition-all group"
                        onClick={() => handleGifClick(gif)}
                      >
                        <img
                          src={gif.images.fixed_height.url}
                          alt={gif.title}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-48 text-center px-4">
                    <ImageIcon className="h-8 w-8 text-muted-foreground/20 mb-2" />
                    <p className="text-xs text-muted-foreground">No GIFs found</p>
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="w-full overflow-hidden">
            {renderEmojiPicker()}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
