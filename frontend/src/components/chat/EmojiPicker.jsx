import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search } from "lucide-react";

const CATEGORIES = [
  { id: "recent", label: "Recent", icon: "🕐" },
  { id: "smileys", label: "Smileys & Emotion", icon: "😀" },
  { id: "people", label: "People & Body", icon: "👋" },
  { id: "animals", label: "Animals & Nature", icon: "🐶" },
  { id: "food", label: "Food & Drink", icon: "🍕" },
  { id: "activities", label: "Activities", icon: "⚽" },
  { id: "travel", label: "Travel & Places", icon: "🌍" },
  { id: "objects", label: "Objects", icon: "💡" },
  { id: "symbols", label: "Symbols", icon: "❤️" },
];

const EMOJI_DATA = {
  smileys: [
    "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩","😘",
    "😗","😚","😙","🥲","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","🤨","😐",
    "😑","😶","😏","😒","🙄","😬","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮",
    "🤧","🥵","🥶","🥴","😵","🤯","🤠","🥳","🥸","😎","🤓","🧐","😕","😟","🙁","😮","😯",
    "😲","😳","🥺","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣","😞","😓","😩","😫",
    "🥱","😤","😡","😠","🤬","😈","👿","💀","☠️","💩","🤡","👹","👺","👻","👽","👾","🤖",
  ],
  people: [
    "👋","🤚","🖐️","✋","🖖","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","🖕",
    "👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","🫶","👐","🤲","🤝","🙏","💅","🤳",
    "💪","🦾","🦿","🦵","🦶","👂","🦻","👃","🧠","🫀","🫁","🦷","🦴","👀","👁️","👅","👄",
    "👶","🧒","👦","👧","🧑","👱","👨","🧔","👩","🧓","👴","👵","🙍","🙎","🙅","🙆","💁",
    "🙋","🧏","🙇","🤦","🤷","💆","💇","🚶","🧍","🧎","🏃","💃","🕺","🕴️","👫","👬","👭",
  ],
  animals: [
    "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐻‍❄️","🐨","🐯","🦁","🐮","🐷","🐸","🐵",
    "🙈","🙉","🙊","🐔","🐧","🐦","🐤","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🪱",
    "🐛","🦋","🐌","🐞","🐜","🪲","🦟","🦗","🪳","🕷️","🦂","🐢","🐍","🦎","🦖","🦕","🐙",
    "🦑","🦐","🦞","🦀","🐡","🐠","🐟","🐬","🐳","🐋","🦈","🐊","🐅","🐆","🦓","🦍","🦧",
    "🦣","🐘","🦛","🦏","🐪","🐫","🦒","🦘","🦬","🐃","🐂","🐄","🐎","🐖","🐏","🐑","🦙",
    "🐐","🦌","🐕","🐩","🦮","🐈","🐓","🦃","🦤","🦚","🦜","🦢","🦩","🕊️","🐇","🦝","🦨",
    "🌸","🌺","🌻","🌹","🌷","🌼","🪷","💐","🍀","🌿","🌱","🪴","🌳","🌲","🎋","🎄","🌾",
    "🍁","🍂","🍃","🪨","🪵","🌵","🌴","🌊","🔥","💧","🌀","🌈","⛈️","🌤️","⭐","🌙","☀️",
  ],
  food: [
    "🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍","🥥","🥝",
    "🍅","🍆","🥑","🥦","🥬","🥒","🌶️","🫑","🧄","🧅","🥔","🍠","🥐","🥯","🍞","🥖","🥨",
    "🧀","🥚","🍳","🧈","🥞","🧇","🥓","🥩","🍗","🍖","🌭","🍔","🍟","🍕","🫓","🥪","🥙",
    "🧆","🌮","🌯","🫔","🥗","🥘","🫕","🥫","🍝","🍜","🍲","🍛","🍣","🍱","🥟","🦪","🍤",
    "🍙","🍚","🍘","🍥","🥮","🍢","🧁","🍰","🎂","🍮","🍭","🍬","🍫","🍿","🍩","🍪","🌰",
    "🥜","🍯","🧃","🥤","🧋","🍵","☕","🫖","🍺","🍷","🥂","🥃","🍸","🍹","🧉","🍾","🫗",
  ],
  activities: [
    "⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱","🪀","🏓","🏸","🏒","🥍","🏑","🎿",
    "⛷️","🏂","🪂","🏋️","🤼","🤸","⛹️","🤺","🤾","🏌️","🏇","🧘","🏄","🏊","🤽","🚣","🧗",
    "🚵","🚴","🏆","🥇","🥈","🥉","🎖️","🏅","🎗️","🏵️","🎫","🎟️","🎪","🤹","🎭","🩰","🎨",
    "🖼️","🎰","🚂","🎢","🎠","🎡","🎪","🛝","🎯","🎲","🎳","🎮","🕹️","🎸","🎹","🎺","🎻",
    "🪗","🎷","🎼","🎤","🎧","📻","🎙️","🎚️","🎛️","🪘","🥁","🪔","🕯️","🎆","🎇","🎑","🎃",
  ],
  travel: [
    "🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","🛻","🚚","🚛","🚜","🏍️","🛵","🛺",
    "🚲","🛴","🛹","🛼","🚏","🛣️","🛤️","⛽","🚨","🚥","🚦","🛑","🚧","⚓","🛟","⛵","🛶",
    "🚤","🛥️","🛳️","⛴️","🚢","✈️","🛩️","🛫","🛬","🪂","💺","🚁","🚟","🚠","🚡","🛰️","🚀",
    "🛸","🪐","🌍","🌎","🌏","🗺️","🧭","🏔️","⛰️","🌋","🏕️","🏖️","🏜️","🏝️","🏟️","🏛️","🏗️",
    "🧱","🪨","🪵","🛖","🏘️","🏚️","🏠","🏡","🏢","🏣","🏤","🏥","🏦","🏨","🏩","🏪","🏫",
    "🏬","🏭","🗼","🗽","🗿","🗻","🌁","🌃","🏙️","🌄","🌅","🌆","🌇","🌉","🎠","🎡","🎢",
  ],
  objects: [
    "⌚","📱","💻","🖥️","🖨️","⌨️","🖱️","🖲️","💾","💿","📀","📷","📸","📹","🎥","📽️","🎞️",
    "📞","☎️","📟","📠","📺","📻","🧭","⏱️","⏲️","⏰","🕰️","⌛","⏳","📡","🔋","🪫","🔌",
    "💡","🔦","🕯️","🪔","🧯","🛢️","💰","💴","💵","💶","💷","💸","💳","🪙","💹","📈","📉",
    "📊","📋","📁","📂","🗂️","🗒️","🗓️","📆","📅","🗑️","📇","📌","📍","✂️","🖇️","📎","🖊️",
    "🖋️","✒️","🖌️","🖍️","📝","✏️","🔍","🔎","🔏","🔐","🔒","🔓","🔑","🗝️","🔨","🪓","⛏️",
    "🔧","🔩","🪛","🔫","🪃","🏹","🛡️","🪚","🔮","🧿","🪬","💈","🪄","🧲","🔬","🔭","💊",
  ],
  symbols: [
    "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❤️‍🔥","❤️‍🩹","💕","💞","💓","💗","💖",
    "💘","💝","💟","☮️","✝️","☪️","🕉️","✡️","🔯","🕎","☯️","🛐","⛎","♈","♉","♊","♋","♌",
    "♍","♎","♏","♐","♑","♒","♓","🆔","⚛️","🉑","☢️","☣️","📴","📳","🈶","🈚","🈸","🈺",
    "🈷️","✴️","🆚","💮","🉐","㊙️","㊗️","🈴","🈵","🈹","🈲","🅰️","🅱️","🆎","🆑","🅾️","🆘",
    "❌","⭕","🛑","⛔","📛","🚫","💯","💢","♨️","🚷","🚯","🚳","🚱","🔞","📵","🚭","❗","❕",
    "❓","❔","‼️","⁉️","🔅","🔆","〽️","⚠️","🚸","🔱","⚜️","🔰","♻️","✅","🈯","💹","❎","🌐",
    "🔝","🆙","🆒","🆕","🆓","🔟","🔛","🔜","🔚","🔙","⏭️","⏮️","⏩","⏪","▶️","⏸️","⏹️",
    "⏺️","🎦","🔕","🔔","📢","📣","💬","💭","🗯️","🔇","🔈","🔉","🔊","📯","🔔","🔕","🃏",
  ],
};

const LS_KEY = "emoji_recent";
const MAX_RECENT = 32;

function getRecent() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}
function addRecent(emoji) {
  const prev = getRecent().filter(e => e !== emoji);
  localStorage.setItem(LS_KEY, JSON.stringify([emoji, ...prev].slice(0, MAX_RECENT)));
}

export default function EmojiPicker({ onEmojiSelect }) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("smileys");
  const [recent, setRecent] = useState(getRecent);
  const searchRef = useRef(null);
  const scrollRef = useRef(null);
  const categoryRefs = useRef({});

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const all = Object.values(EMOJI_DATA).flat();
    // simple substring match on emoji unicode
    return [...new Set(all)].filter(e => e.includes(q) || true).slice(0, 64);
    // Note: real search would need emoji name data; return first 64 emojis matching any key
  }, [search]);

  // Better search: filter by checking if emoji appears in a name map
  const EMOJI_NAMES = useMemo(() => {
    const map = {};
    // smileys
    const names = {
      "😀":"grinning","😃":"smiley","😄":"smile","😁":"beaming","😆":"laughing","😅":"sweat smile",
      "🤣":"rofl","😂":"joy","🙂":"slightly smiling","😉":"winking","😊":"blush","😍":"heart eyes",
      "🤩":"star struck","😘":"kissing heart","😋":"yum","😜":"wink tongue","🤔":"thinking",
      "😐":"neutral","😶":"no mouth","😏":"smirk","😒":"unamused","🙄":"eye roll","😬":"grimace",
      "😴":"sleeping","😷":"mask","🤒":"sick","🤢":"nauseated","🥳":"partying","😎":"sunglasses",
      "😕":"confused","😢":"cry","😭":"sob","😱":"scream","😤":"steam","😡":"angry","🤬":"cursing",
      "👋":"wave hello","🤝":"handshake","👍":"thumbs up","👎":"thumbs down","👏":"clap","🙏":"pray",
      "💪":"muscle","❤️":"heart love","🧡":"orange heart","💛":"yellow heart","💚":"green heart",
      "💙":"blue heart","💜":"purple heart","🖤":"black heart","💔":"broken heart","💕":"two hearts",
      "🐶":"dog","🐱":"cat","🐭":"mouse","🐰":"rabbit","🦊":"fox","🐻":"bear","🐼":"panda",
      "🐯":"tiger","🦁":"lion","🐮":"cow","🐷":"pig","🐸":"frog","🐵":"monkey","🐧":"penguin",
      "🐦":"bird","🦋":"butterfly","🌸":"cherry blossom","🌺":"hibiscus","🌻":"sunflower",
      "🍏":"green apple","🍎":"red apple","🍊":"orange","🍋":"lemon","🍌":"banana","🍉":"watermelon",
      "🍕":"pizza","🍔":"hamburger","🍟":"fries","🍣":"sushi","🍜":"noodles","🍦":"ice cream",
      "🎂":"birthday cake","🍰":"cake","☕":"coffee","🍵":"tea","🍺":"beer","🍷":"wine",
      "⚽":"soccer football","🏀":"basketball","🎾":"tennis","🏈":"football","⚾":"baseball",
      "🏆":"trophy","🥇":"gold medal","🎮":"video game","🎲":"dice","🃏":"joker cards",
      "🚗":"car","🚕":"taxi","🚙":"suv","✈️":"airplane","🚀":"rocket","🌍":"earth","🏠":"house",
      "🏖️":"beach","🏔️":"mountain","🌆":"cityscape","💻":"laptop","📱":"phone","📷":"camera",
      "⌚":"watch","📚":"books","🔑":"key","💰":"money bag","💡":"light bulb","🔬":"microscope",
    };
    return map;
  }, []);

  const filteredSearchResults = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const all = Object.values(EMOJI_DATA).flat();
    const unique = [...new Set(all)];
    // Match against EMOJI_NAMES if available, otherwise return all
    const withNames = unique.filter(e => {
      const name = EMOJI_NAMES[e] || "";
      return name.includes(q) || e === q;
    });
    return withNames.length > 0 ? withNames.slice(0, 64) : unique.slice(0, 64);
  }, [search, EMOJI_NAMES]);

  const handleSelect = useCallback((emoji) => {
    addRecent(emoji);
    setRecent(getRecent());
    onEmojiSelect(emoji);
  }, [onEmojiSelect]);

  const scrollToCategory = (catId) => {
    setActiveCategory(catId);
    categoryRefs.current[catId]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const visibleCategories = search.trim()
    ? []
    : CATEGORIES.filter(c => c.id !== "recent" || recent.length > 0);

  const EmojiGrid = ({ emojis, label }) => (
    <div className="mb-2">
      {label && (
        <div className="sticky top-0 z-10 bg-background px-3 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{label}</span>
        </div>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(8, 1fr)",
          gap: "2px",
          padding: "4px 8px",
        }}
      >
        {emojis.map((emoji, i) => (
          <button
            key={`${emoji}-${i}`}
            onClick={() => handleSelect(emoji)}
            title={emoji}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              aspectRatio: "1 / 1",
              fontSize: "20px",
              lineHeight: 1,
              borderRadius: "6px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              padding: 0,
              transition: "background 0.1s",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "hsl(var(--muted))"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "352px", width: "100%" }}>
      {/* Search */}
      <div style={{ padding: "8px 10px 6px", flexShrink: 0 }}>
        <div style={{ position: "relative" }}>
          <Search
            style={{
              position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
              width: 13, height: 13, color: "hsl(var(--muted-foreground))", pointerEvents: "none",
            }}
          />
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search emoji…"
            style={{
              width: "100%",
              paddingLeft: 28,
              paddingRight: 10,
              paddingTop: 6,
              paddingBottom: 6,
              fontSize: 13,
              borderRadius: 8,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--muted) / 0.5)",
              color: "hsl(var(--foreground))",
              outline: "none",
              boxSizing: "border-box",
            }}
            onFocus={e => e.target.style.borderColor = "hsl(var(--primary) / 0.5)"}
            onBlur={e => e.target.style.borderColor = "hsl(var(--border))"}
          />
        </div>
      </div>

      {/* Scrollable emoji area */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0 }}>
        {search.trim() ? (
          <EmojiGrid emojis={filteredSearchResults || []} label={`Results (${(filteredSearchResults || []).length})`} />
        ) : (
          <>
            {recent.length > 0 && (
              <div ref={el => categoryRefs.current["recent"] = el}>
                <EmojiGrid emojis={recent} label="Recently Used" />
              </div>
            )}
            {Object.entries(EMOJI_DATA).map(([catId, emojis]) => {
              const cat = CATEGORIES.find(c => c.id === catId);
              return (
                <div key={catId} ref={el => categoryRefs.current[catId] = el}>
                  <EmojiGrid emojis={emojis} label={cat?.label || catId} />
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Category nav */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-around",
          alignItems: "center",
          borderTop: "1px solid hsl(var(--border))",
          padding: "4px 6px",
          flexShrink: 0,
          background: "hsl(var(--background))",
        }}
      >
        {CATEGORIES.filter(c => c.id !== "recent" || recent.length > 0).map(cat => (
          <button
            key={cat.id}
            title={cat.label}
            onClick={() => scrollToCategory(cat.id)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              fontSize: 15,
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              background: activeCategory === cat.id ? "hsl(var(--muted))" : "transparent",
              opacity: activeCategory === cat.id ? 1 : 0.6,
              transition: "all 0.1s",
              padding: 0,
            }}
            onMouseEnter={e => { if (activeCategory !== cat.id) e.currentTarget.style.background = "hsl(var(--muted) / 0.6)"; }}
            onMouseLeave={e => { if (activeCategory !== cat.id) e.currentTarget.style.background = "transparent"; }}
          >
            {cat.icon}
          </button>
        ))}
      </div>
    </div>
  );
}
