import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useCharacterLimit } from "@/hooks/use-character-limit";
import { useImageUpload } from "@/hooks/use-image-upload";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImagePlus, X, Loader2 } from "lucide-react";
import { usersApi } from "@/lib/api";
import { getAvatarColor } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const BACKEND_URL = import.meta.env.REACT_APP_BACKEND_URL;

function ProfileBg({ currentBgUrl }) {
  const [hideDefault, setHideDefault] = useState(false);
  const { previewUrl, fileInputRef, handleThumbnailClick, handleFileChange, handleRemove } = useImageUpload();
  const currentImage = previewUrl || (!hideDefault ? currentBgUrl : null);

  return (
    <div className="h-28">
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-muted">
        {currentImage && (
          <img className="h-full w-full object-cover" src={currentImage} alt="Profile background" />
        )}
        <div className="absolute inset-0 flex items-center justify-center gap-2">
          <button
            type="button"
            className="z-50 flex size-9 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white outline-offset-2 transition-colors hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70"
            onClick={handleThumbnailClick}
          >
            <ImagePlus size={15} />
          </button>
          {currentImage && (
            <button
              type="button"
              className="z-50 flex size-9 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white outline-offset-2 transition-colors hover:bg-black/80"
              onClick={() => { handleRemove(); setHideDefault(true); }}
            >
              <X size={15} />
            </button>
          )}
        </div>
        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
      </div>
    </div>
  );
}

function AvatarUpload({ user, onFileSelected, previewUrl }) {
  const fileInputRef = useRef(null);
  const initials = user?.full_name
    ? user.full_name.split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase()
    : (user?.username || "?").substring(0, 2).toUpperCase();

  const currentImage = previewUrl || (user?.avatar_url ? `${BACKEND_URL || ""}${user.avatar_url}` : "");

  return (
    <div className="-mt-10 px-6">
      <div className="relative flex size-20 items-center justify-center overflow-hidden rounded-full border-4 border-background bg-muted shadow-sm">
        {currentImage ? (
          <img src={currentImage} className="h-full w-full object-cover" alt="Avatar" />
        ) : (
          <Avatar className="h-full w-full">
            <AvatarFallback className={`text-lg font-semibold ${getAvatarColor(user?.username || user?.full_name)}`}>
              {initials}
            </AvatarFallback>
          </Avatar>
        )}
        <button
          type="button"
          className="absolute flex size-8 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus size={15} />
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileSelected(f); }}
          className="hidden"
          accept="image/*"
        />
      </div>
    </div>
  );
}

export default function ProfileEditDialog({ open, onOpenChange, user, onSave, required = false }) {
  const maxLength = 180;
  const { value: bio, characterCount, handleChange: handleBioChange, maxLength: bioLimit, reset: resetBio } = useCharacterLimit({
    maxLength,
    initialValue: user?.bio || "",
  });

  const [form, setForm] = useState({
    full_name: user?.full_name || "",
    username: user?.username || "",
    email: user?.email || "",
    phone: user?.phone || "",
    mobile_alt: user?.mobile_alt || "",
    date_of_birth: user?.date_of_birth || "",
  });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Pre-fill form synchronously before browser paints (prevents flash of empty fields)
  useLayoutEffect(() => {
    if (open) {
      setForm({
        full_name: user?.full_name || "",
        username: user?.username || "",
        email: user?.email || "",
        phone: user?.phone || "",
        mobile_alt: user?.mobile_alt || "",
        date_of_birth: (user?.date_of_birth || "").slice(0, 10),
      });
      resetBio(user?.bio || "");
      setAvatarFile(null);
      setAvatarPreview("");
      setError("");
    }
  }, [open]);

  const handleAvatarSelected = (file) => {
    setAvatarFile(file);
    const url = URL.createObjectURL(file);
    setAvatarPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  };

  const handleSave = async () => {
    setError("");
    if (!form.email.trim()) { setError("Email is required."); return; }
    if (!form.phone.trim()) { setError("Mobile Number is required."); return; }
    if (!form.date_of_birth) { setError("Date of Birth is required."); return; }

    setSaving(true);
    try {
      if (avatarFile) {
        const fd = new FormData();
        fd.append("file", avatarFile);
        await usersApi.uploadAvatar(user.id, fd);
      }
      const payload = {};
      if (form.full_name.trim()) payload.full_name = form.full_name.trim();
      if (form.username.trim()) payload.username = form.username.trim().toLowerCase();
      payload.email = form.email.trim();
      payload.phone = form.phone.trim();
      payload.mobile_alt = form.mobile_alt.trim();
      if (form.date_of_birth) payload.date_of_birth = form.date_of_birth;
      if (bio.trim()) payload.bio = bio.trim();
      await usersApi.update(user.id, payload);
      await onSave?.();
      onOpenChange(false);
    } catch (err) {
      setError(err?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={required ? () => {} : onOpenChange}>
      <DialogContent
        className="flex flex-col gap-0 overflow-y-visible p-0 sm:max-w-lg [&>button:last-child]:top-3.5"
        onPointerDownOutside={required ? (e) => e.preventDefault() : undefined}
        onEscapeKeyDown={required ? (e) => e.preventDefault() : undefined}
      >
        <DialogHeader className="contents space-y-0 text-left">
          <DialogTitle className="border-b border-border px-6 py-4 text-base">
            {required ? "Complete Your Profile" : "Edit Profile"}
          </DialogTitle>
        </DialogHeader>
        <DialogDescription className="sr-only">
          Update your profile details. Required fields are marked with *.
        </DialogDescription>

        <div className="overflow-y-auto max-h-[70vh]">
          <ProfileBg currentBgUrl={null} />
          <AvatarUpload user={user} onFileSelected={handleAvatarSelected} previewUrl={avatarPreview} />

          <div className="px-6 pb-4 pt-4">
            {required && (
              <p className="text-xs text-muted-foreground mb-3">Please fill in the required fields to continue using ShiftRoster.</p>
            )}
            <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
              {/* Name row */}
              <div className="flex gap-3">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="pf-first">First Name</Label>
                  <Input
                    id="pf-first"
                    value={form.full_name.split(" ")[0] || ""}
                    onChange={(e) => {
                      const last = form.full_name.split(" ").slice(1).join(" ");
                      setForm(f => ({ ...f, full_name: (e.target.value + (last ? " " + last : "")).trim() }));
                    }}
                    placeholder="First name"
                  />
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="pf-last">Last Name</Label>
                  <Input
                    id="pf-last"
                    value={form.full_name.split(" ").slice(1).join(" ")}
                    onChange={(e) => {
                      const first = form.full_name.split(" ")[0] || "";
                      setForm(f => ({ ...f, full_name: (first + (e.target.value ? " " + e.target.value : "")).trim() }));
                    }}
                    placeholder="Last name"
                  />
                </div>
              </div>

              {/* Username */}
              <div className="space-y-1.5">
                <Label htmlFor="pf-username">Username</Label>
                <Input
                  id="pf-username"
                  value={form.username}
                  onChange={(e) => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, "") }))}
                  placeholder="john.doe"
                />
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <Label htmlFor="pf-email">Email <span className="text-destructive">*</span></Label>
                <Input
                  id="pf-email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="you@example.com"
                />
              </div>

              {/* Mobile row */}
              <div className="flex gap-3">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="pf-phone">Mobile <span className="text-destructive">*</span></Label>
                  <Input
                    id="pf-phone"
                    required
                    value={form.phone}
                    onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+1 555 000 0000"
                  />
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="pf-alt">Alt Mobile <span className="text-muted-foreground text-xs">(opt)</span></Label>
                  <Input
                    id="pf-alt"
                    value={form.mobile_alt}
                    onChange={(e) => setForm(f => ({ ...f, mobile_alt: e.target.value }))}
                    placeholder="+1 555 000 0001"
                  />
                </div>
              </div>

              {/* Date of Birth */}
              <div className="space-y-1.5">
                <Label htmlFor="pf-dob">Date of Birth <span className="text-destructive">*</span></Label>
                <Input
                  id="pf-dob"
                  type="date"
                  required
                  value={form.date_of_birth}
                  onChange={(e) => setForm(f => ({ ...f, date_of_birth: e.target.value }))}
                />
              </div>

              {/* Bio */}
              <div className="space-y-1.5">
                <Label htmlFor="pf-bio">Bio</Label>
                <Textarea
                  id="pf-bio"
                  value={bio}
                  onChange={handleBioChange}
                  maxLength={maxLength}
                  placeholder="Tell your team a bit about yourself..."
                  className="resize-none"
                  rows={3}
                />
                <p className="text-right text-xs text-muted-foreground">
                  <span className="tabular-nums">{bioLimit - characterCount}</span> characters left
                </p>
              </div>

              {error && <p className="text-xs text-destructive">{error}</p>}
            </form>
          </div>
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          {!required && (
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
          )}
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            {required ? "Update & Continue" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
