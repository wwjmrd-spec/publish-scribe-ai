import React, { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { PageLayout } from "@/components/layout/PageLayout";
import { GlassCard } from "@/components/layout/GlassCard";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, MapPin, Phone, Mail, Send, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isHoneypotFilled, isSubmissionTooFast, isSpamContent } from "@/lib/antispam";

function ContactBody() {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", email: "", subject: "", phone: "", message: "" });
  const [website, setWebsite] = useState(""); // honeypot
  const startTime = useRef(Date.now());
  const [sending, setSending] = useState(false);

  // Simple human-verification challenge (math captcha).
  const [a] = useState(() => Math.floor(Math.random() * 8) + 2);
  const [b] = useState(() => Math.floor(Math.random() * 8) + 2);
  const [captchaAnswer, setCaptchaAnswer] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Honeypot — if hidden field is filled, silently succeed.
    if (isHoneypotFilled(website)) {
      toast({ title: "Message sent", description: "Thanks — we will get back to you shortly." });
      setForm({ name: "", email: "", subject: "", phone: "", message: "" });
      return;
    }

    // 2. Required fields
    if (!form.name || !form.email || !form.subject || !form.message) {
      toast({ title: "Please fill the required fields", variant: "destructive" });
      return;
    }

    // 3. Human-verification challenge
    if (parseInt(captchaAnswer, 10) !== a + b) {
      toast({
        title: "Verification failed",
        description: `Please answer: what is ${a} + ${b}?`,
        variant: "destructive",
      });
      return;
    }

    // 4. Timing — too fast = likely a bot
    if (isSubmissionTooFast(startTime.current, 4)) {
      toast({ title: "Please slow down", description: "Submission too fast — try again.", variant: "destructive" });
      return;
    }

    // 5. Spam content
    if (isSpamContent(form.message) || isSpamContent(form.subject)) {
      toast({ title: "Message flagged as spam", description: "Please rephrase your message.", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      const { error } = await (supabase as any).from("contact_questions").insert({
        name: form.name.trim().slice(0, 100),
        email: form.email.trim().slice(0, 200),
        subject: form.subject.trim().slice(0, 200),
        phone: form.phone.trim().slice(0, 50) || null,
        message: form.message.trim().slice(0, 4000),
        user_agent: navigator.userAgent.slice(0, 500),
      });
      if (error) throw error;

      // Admin is notified via the database trigger that creates an in-app
      // notification + admin email through the regular notification pipeline.
      // We intentionally do NOT call send-email with custom HTML from the
      // public contact form to avoid HTML injection in admin inboxes and to
      // prevent abuse of the email sender as an open relay.

      toast({ title: "Message sent", description: "Thanks — we will get back to you shortly." });
      setForm({ name: "", email: "", subject: "", phone: "", message: "" });
      setCaptchaAnswer("");
    } catch (err: any) {
      toast({ title: "Failed to send", description: err?.message || "Try again later", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <GlassCard>
        <h2 className="font-display text-xl font-semibold mb-4">Reach Us</h2>
        <ul className="space-y-3 text-sm">
          <li className="flex gap-3">
            <MapPin className="w-4 h-4 mt-0.5 text-primary" /> B-103, Vijay Vihar, Delhi -110085, India
          </li>
          <li className="flex gap-3">
            <Phone className="w-4 h-4 mt-0.5 text-primary" /> +91 9999 669 429
          </li>
          <li className="flex gap-3">
            <Mail className="w-4 h-4 mt-0.5 text-primary" /> support@wwjmrd.com
          </li>
        </ul>
        <div className="mt-6 rounded-lg overflow-hidden border border-[hsl(var(--glass-border))]">
          <iframe
            title="Location"
            src="https://www.google.com/maps?q=B-103,+Vijay+Vihar,+Delhi+110085&output=embed"
            className="w-full h-64"
            loading="lazy"
          />
        </div>
      </GlassCard>

      <GlassCard>
        <h2 className="font-display text-xl font-semibold mb-4">Interested in discussing?</h2>
        <form onSubmit={submit} className="space-y-3">
          {/* Honeypot — hidden from humans */}
          <div className="hidden" aria-hidden="true">
            <Label>Website</Label>
            <Input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>

          <div>
            <Label>Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="glass-input"
            />
          </div>
          <div>
            <Label>Email *</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="glass-input"
            />
          </div>
          <div>
            <Label>Subject *</Label>
            <Input
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className="glass-input"
            />
          </div>
          <div>
            <Label>Phone</Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="glass-input"
            />
          </div>
          <div>
            <Label>Message *</Label>
            <Textarea
              rows={5}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              className="glass-input"
            />
          </div>

          <div className="rounded-lg border border-[hsl(var(--glass-border))] bg-[hsl(var(--glass-bg))] p-3">
            <Label className="flex items-center gap-2 mb-2 text-xs">
              <ShieldCheck className="w-4 h-4 text-primary" /> Human verification *
            </Label>
            <div className="flex items-center gap-3">
              <span className="text-sm">
                What is{" "}
                <strong>
                  {a} + {b}
                </strong>
                ?
              </span>
              <Input
                type="number"
                value={captchaAnswer}
                onChange={(e) => setCaptchaAnswer(e.target.value)}
                className="glass-input w-24"
                placeholder="?"
              />
            </div>
          </div>

          <Button type="submit" disabled={sending} className="gradient-primary w-full">
            <Send className="w-4 h-4 mr-2" /> {sending ? "Sending…" : "Send message"}
          </Button>
        </form>
      </GlassCard>
    </div>
  );
}

export default function Contact() {
  const { user } = useAuth();
  if (user) {
    return (
      <DashboardLayout type="author">
        <div className="max-w-5xl mx-auto">
          <h1 className="font-display text-3xl font-bold mb-6 gradient-text">Contact Us</h1>
          <ContactBody />
        </div>
      </DashboardLayout>
    );
  }
  return (
    <PageLayout>
      <div className="container mx-auto px-4 py-16 pt-28 max-w-5xl">
        <Link to="/">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> Home
          </Button>
        </Link>
        <h1 className="font-display text-3xl md:text-4xl font-bold mb-6 gradient-text">Contact Us</h1>
        <ContactBody />
      </div>
    </PageLayout>
  );
}
