import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { chatApi } from "@/lib/api";

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const [channels, setChannels] = useState([]);
  const [dms, setDMs] = useState([]);
  const [activeChannelId, setActiveChannelId] = useState(null);
  // messages keyed by channelId
  const messagesRef = useRef({});
  const [messages, setMessages] = useState({});
  const [typingUsers, setTypingUsers] = useState({}); // {channelId: [{user_id, user_name}]}
  const [unreadCounts, setUnreadCounts] = useState({});
  const [totalUnread, setTotalUnread] = useState(0);
  const [userCache, setUserCache] = useState({}); // {username: {full_name, avatar_url, initials}}
  const typingTimers = useRef({});

  const updateCache = useCallback((users) => {
    setUserCache((prev) => {
      const next = { ...prev };
      let changed = false;
      users.forEach((u) => {
        if (!next[u.username] || next[u.username].full_name !== u.full_name) {
          next[u.username] = {
            id: u.id,
            full_name: u.full_name,
            avatar_url: u.avatar_url,
            initials: u.initials,
          };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, []);

  // Load channels + DMs
  const loadChannels = useCallback(async () => {
    try {
      const [chRes, dmRes] = await Promise.all([
        chatApi.listChannels(),
        chatApi.listDMs(),
      ]);
      setChannels(chRes.data.channels || []);
      setDMs(dmRes.data.dms || []);

      // Rebuild unread counts from loaded data
      const counts = {};
      let total = 0;
      for (const ch of chRes.data.channels || []) {
        counts[ch.id] = ch.unread_count || 0;
        total += ch.unread_count || 0;
      }
      for (const dm of dmRes.data.dms || []) {
        counts[dm.id] = dm.unread_count || 0;
        total += dm.unread_count || 0;
      }
      setUnreadCounts(counts);
      setTotalUnread(total);

      // ── Set Default Channel (#general) ──
      if (!activeChannelId) {
        const general = (chRes.data.channels || []).find(ch => ch.name === "general");
        if (general) {
          setActiveChannelId(general.id);
        } else if (chRes.data.channels && chRes.data.channels.length > 0) {
          setActiveChannelId(chRes.data.channels[0].id);
        }
      }
    } catch (err) {
      // silently ignore — user may not be logged in yet
    }
  }, []);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  // Load messages for a channel
  const loadMessages = useCallback(async (channelId, isChannel = true) => {
    try {
      const res = isChannel
        ? await chatApi.getChannelMessages(channelId, { limit: 50 })
        : await chatApi.getDMMessages(channelId, { limit: 50 });
      const msgs = res.data.messages || [];
      messagesRef.current = { ...messagesRef.current, [channelId]: msgs };
      setMessages((prev) => ({ ...prev, [channelId]: msgs }));
      return msgs;
    } catch {
      return [];
    }
  }, []);

  // Load more (older) messages
  const loadMoreMessages = useCallback(async (channelId, isChannel = true) => {
    const existing = messagesRef.current[channelId] || [];
    if (existing.length === 0) return [];
    const oldest = existing[0];
    try {
      const res = isChannel
        ? await chatApi.getChannelMessages(channelId, { limit: 50, before: oldest.id })
        : await chatApi.getDMMessages(channelId, { limit: 50, before: oldest.id });
      const older = res.data.messages || [];
      if (older.length === 0) return [];
      const merged = [...older, ...existing];
      messagesRef.current = { ...messagesRef.current, [channelId]: merged };
      setMessages((prev) => ({ ...prev, [channelId]: merged }));
      return older;
    } catch {
      return [];
    }
  }, []);

  // Send message
  const sendMessage = useCallback(async (channelId, text, replyToId = null, isChannel = true, fileData = null, extraPayload = {}) => {
    try {
      const payload = {
        text: text || "",
        reply_to_id: replyToId || undefined,
        ...extraPayload,
        ...(fileData ? {
          file_url: fileData.url,
          file_name: fileData.file_name,
          file_size: fileData.file_size,
          file_type: fileData.file_type,
        } : {}),
      };
      const res = isChannel
        ? await chatApi.sendChannelMessage(channelId, payload)
        : await chatApi.sendDMMessage(channelId, payload);
      const msg = res.data;
      if (msg && msg.id) {
        // Optimistic update: append immediately so sender sees their message
        const current = messagesRef.current[channelId] || [];
        if (!current.some((m) => m.id === msg.id)) {
          const updated = [...current, msg];
          messagesRef.current = { ...messagesRef.current, [channelId]: updated };
          setMessages((prev) => ({ ...prev, [channelId]: updated }));
        }
      }
      return msg;
    } catch {
      return null;
    }
  }, []);

  // Edit message
  const editMessage = useCallback(async (messageId, text) => {
    try {
      const res = await chatApi.editMessage(messageId, { text });
      return res.data;
    } catch {
      return null;
    }
  }, []);

  // Delete message
  const deleteMessage = useCallback(async (messageId) => {
    try {
      await chatApi.deleteMessage(messageId);
      return true;
    } catch {
      return false;
    }
  }, []);

  // React to message
  const reactToMessage = useCallback(async (messageId, emoji) => {
    try {
      const res = await chatApi.reactToMessage(messageId, { emoji });
      return res.data;
    } catch {
      return null;
    }
  }, []);

  // Mark read
  const markRead = useCallback(async (channelId, isChannel = true) => {
    try {
      if (isChannel) {
        await chatApi.markChannelRead(channelId);
      } else {
        await chatApi.markDMRead(channelId);
      }
      setUnreadCounts((prev) => {
        const next = { ...prev, [channelId]: 0 };
        const total = Object.values(next).reduce((a, b) => a + b, 0);
        setTotalUnread(total);
        return next;
      });
      // Update the channel/dm list too
      setChannels((prev) => prev.map((ch) => ch.id === channelId ? { ...ch, unread_count: 0 } : ch));
      setDMs((prev) => prev.map((dm) => dm.id === channelId ? { ...dm, unread_count: 0 } : dm));
    } catch {}
  }, []);

  // Create channel
  const createChannel = useCallback(async (data) => {
    const res = await chatApi.createChannel(data);
    const ch = res.data;
    setChannels((prev) => [ch, ...prev]);
    return ch;
  }, []);

  // Join channel
  const joinChannel = useCallback(async (channelId) => {
    await chatApi.joinChannel(channelId);
    setChannels((prev) => prev.map((ch) => ch.id === channelId ? { ...ch, is_member: true } : ch));
  }, []);

  // Leave channel
  const leaveChannel = useCallback(async (channelId) => {
    await chatApi.leaveChannel(channelId);
    setChannels((prev) => prev.map((ch) => ch.id === channelId ? { ...ch, is_member: false } : ch));
  }, []);

  // Mute channel
  const muteChannel = useCallback(async (channelId, isMuted) => {
    await chatApi.muteChannel(channelId, { is_muted: isMuted });
    setChannels((prev) => prev.map((ch) => ch.id === channelId ? { ...ch, is_muted: isMuted } : ch));
  }, []);

  // Open DM
  const openDM = useCallback(async (userId) => {
    const res = await chatApi.openDM({ user_id: userId });
    const dm = res.data;
    setDMs((prev) => {
      const exists = prev.find((d) => d.id === dm.id);
      if (exists) return prev;
      return [dm, ...prev];
    });
    return dm;
  }, []);

  // Handle incoming WebSocket messages (dispatched by AppLayout via CustomEvent)
  const handleWsMessage = useCallback((msg) => {
    switch (msg.type) {
      case "chat_new_message": {
        const { channel_id, message } = msg;
        // Append to cache
        const current = messagesRef.current[channel_id] || [];
        const already = current.some((m) => m.id === message.id);
        if (!already) {
          const updated = [...current, message];
          messagesRef.current = { ...messagesRef.current, [channel_id]: updated };
          setMessages((prev) => ({ ...prev, [channel_id]: updated }));
          
          // Update userCache if we have sender info
          if (message.sender_username && message.sender_name) {
            updateCache([{
              username: message.sender_username,
              full_name: message.sender_name,
              avatar_url: message.avatar_url || "",
              initials: message.sender_initials || "",
            }]);
          }
        }

        // Update last_message_preview on channel / dm list
        setChannels((prev) => prev.map((ch) => ch.id === channel_id
          ? { ...ch, last_message_preview: message.text, last_message_at: message.created_at }
          : ch
        ));
        setDMs((prev) => prev.map((dm) => dm.id === channel_id
          ? { ...dm, last_message_preview: message.text, last_message_at: message.created_at }
          : dm
        ));

        // Increment unread if not the active channel
        if (channel_id !== activeChannelId) {
          setUnreadCounts((prev) => {
            const next = { ...prev, [channel_id]: (prev[channel_id] || 0) + 1 };
            setTotalUnread(Object.values(next).reduce((a, b) => a + b, 0));
            return next;
          });
          setChannels((prev) => prev.map((ch) => ch.id === channel_id
            ? { ...ch, unread_count: (ch.unread_count || 0) + 1 }
            : ch
          ));
          setDMs((prev) => prev.map((dm) => dm.id === channel_id
            ? { ...dm, unread_count: (dm.unread_count || 0) + 1 }
            : dm
          ));
        }
        break;
      }

      case "chat_message_updated": {
        const { channel_id, message } = msg;
        const current = messagesRef.current[channel_id] || [];
        const updated = current.map((m) => m.id === message.id ? message : m);
        messagesRef.current = { ...messagesRef.current, [channel_id]: updated };
        setMessages((prev) => ({ ...prev, [channel_id]: updated }));
        break;
      }

      case "chat_typing": {
        const { channel_id, user_id, user_name, is_typing } = msg;
        setTypingUsers((prev) => {
          const list = prev[channel_id] || [];
          if (is_typing) {
            const exists = list.some((u) => u.user_id === user_id);
            if (exists) return prev;
            return { ...prev, [channel_id]: [...list, { user_id, user_name }] };
          } else {
            return { ...prev, [channel_id]: list.filter((u) => u.user_id !== user_id) };
          }
        });

        // Auto-clear after 4s
        const timerKey = `${channel_id}:${user_id}`;
        if (typingTimers.current[timerKey]) {
          clearTimeout(typingTimers.current[timerKey]);
        }
        if (is_typing) {
          typingTimers.current[timerKey] = setTimeout(() => {
            setTypingUsers((prev) => ({
              ...prev,
              [channel_id]: (prev[channel_id] || []).filter((u) => u.user_id !== user_id),
            }));
            delete typingTimers.current[timerKey];
          }, 4000);
        }
        break;
      }

      case "chat_channel_added": {
        const { channel } = msg;
        setChannels((prev) => {
          const exists = prev.find((ch) => ch.id === channel.id);
          if (exists) return prev;
          return [channel, ...prev];
        });
        break;
      }

      case "chat_unread_update": {
        const { counts } = msg;
        setUnreadCounts(counts);
        setTotalUnread(Object.values(counts).reduce((a, b) => a + b, 0));
        break;
      }

      default:
        break;
    }
  }, [activeChannelId]);

  // Listen for WS events dispatched from AppLayout
  useEffect(() => {
    const handler = (e) => handleWsMessage(e.detail);
    window.addEventListener("ws:chat", handler);
    return () => window.removeEventListener("ws:chat", handler);
  }, [handleWsMessage]);

  return (
    <ChatContext.Provider value={{
      channels,
      dms,
      activeChannelId,
      setActiveChannelId,
      messages,
      loadMessages,
      loadMoreMessages,
      sendMessage,
      editMessage,
      deleteMessage,
      reactToMessage,
      typingUsers,
      unreadCounts,
      totalUnread,
      markRead,
      createChannel,
      joinChannel,
      openDM,
      loadChannels,
      userCache,
      updateCache,
      leaveChannel,
      muteChannel,
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside ChatProvider");
  return ctx;
}
