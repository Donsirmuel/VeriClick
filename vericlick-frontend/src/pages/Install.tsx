import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  CodeIcon,
  Copy01Icon,
  CheckmarkCircle02Icon,
  Download01Icon,
} from "@hugeicons/core-free-icons";
import toast from "react-hot-toast";
import { fetchDomains, fetchSnippet } from "@/api/workspace";
import { DashboardSkeleton } from "@/components/ui/DashboardSkeleton";

type Platform = "html" | "wordpress" | "shopify" | "wix" | "squarespace" | "webflow" | "cpanel";

interface PlatformGuide {
  key: Platform;
  name: string;
  icon: string;
  description: string;
  detailedSteps: string[];
  iniSnippet?: string;
  iniHint?: string;
  altMethods?: { id: string; label: string; steps: string[]; iniSnippet: string; iniHint: string }[];
}

const PLATFORMS: PlatformGuide[] = [
  {
    key: "html",
    name: "HTML",
    icon: "🌐",
    description: "Add before the closing </head> tag",
    detailedSteps: [
      "Open your HTML file",
      "Find the <head> section",
      "Paste the snippet before the closing </head> tag",
      "Save and deploy your changes",
    ],
  },
  {
    key: "wordpress",
    name: "WordPress",
    icon: "📝",
    description: "Plugin or theme header",
    detailedSteps: [
      "Option A — Plugin: Install 'Insert Headers and Footers' by WPCode",
      "Go to Code Snippets > Header & Footer",
      "Paste the snippet in the Header section",
      "Save and activate",
      "Option B — Theme: Go to Appearance > Theme File Editor",
      "Open header.php and paste in the <head> section",
    ],
  },
  {
    key: "shopify",
    name: "Shopify",
    icon: "🛒",
    description: "theme.liquid before </head>",
    detailedSteps: [
      "Go to Online Store > Edit Code",
      "Open layout/theme.liquid",
      "Find the </head> tag",
      "Paste the snippet immediately before it",
      "Save",
    ],
  },
  {
    key: "wix",
    name: "Wix",
    icon: "✨",
    description: "Custom code via Settings",
    detailedSteps: [
      "Go to Settings > Custom Code (or trackalytics in newer Wix)",
      "Click '+ Add Custom Code'",
      "Select 'Head' as the placement",
      "Paste the snippet",
      "Save and publish",
    ],
  },
  {
    key: "squarespace",
    name: "Squarespace",
    icon: "🎨",
    description: "Code Injection in site settings",
    detailedSteps: [
      "Go to Settings > Advanced > Code Injection",
      "Paste the snippet in the 'Header' field",
      "Click Save",
    ],
  },
  {
    key: "webflow",
    name: "Webflow",
    icon: "🖼️",
    description: "Site Settings > Custom Code > Head Code",
    detailedSteps: [
      "Go to Site Settings > Custom Code",
      "Paste in the 'Head Code' section",
      "Save and publish your site",
    ],
  },
  {
    key: "cpanel",
    name: "cPanel / PHP",
    icon: "📁",
    description: "Auto-inject via PHP prepend — no template editing",
    detailedSteps: [],
    altMethods: [
      { id: 'dot-user-ini', label: '.user.ini file', steps: [
        'Click the download buttons above to save all three files',
        "Log in to cPanel \u2192 File Manager \u2192 open your site's root folder (public_html)",
        'Upload all three files there',
        'Rename vericlick-user-ini.txt to .user.ini and replace USERNAME with your cPanel username',
        'Save and wait about 5 minutes \u2014 PHP picks up the new setting automatically',
      ], iniSnippet: 'auto_prepend_file = "/home/USERNAME/public_html/vericlick-prepend.php"', iniHint: '.user.ini is a hidden file — in cPanel File Manager, click Settings and enable "Show Hidden Files (dotfiles)" to see it. Rename vericlick-user-ini.txt to .user.ini.' },
      { id: 'multiphp', label: 'MultiPHP INI Editor', steps: [
        'Click the download buttons above to save the .js and prepend.php files',
        "Log in to cPanel \u2192 File Manager \u2192 open your site's root folder (public_html)",
        'Upload both files there',
        "Go to cPanel \u2192 Software \u2192 MultiPHP INI Editor \u2192 Editor Mode \u2192 select Home Directory",
        "Paste the line below into the editor (replace USERNAME with your cPanel username):",
        'Click Save, then wait about 5 minutes \u2014 PHP picks up the new setting automatically',
      ], iniSnippet: 'auto_prepend_file = "/home/USERNAME/public_html/vericlick-prepend.php"', iniHint: 'The line must start with auto_prepend_file = \u2014 if you see "invalid line", you may have pasted only the path without the setting name.' },
    ],
  },
];

export default function InstallPage() {
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>("html");
  const [cpanelMethod, setCpanelMethod] = useState("dot-user-ini");
  const [selectedDomainId, setSelectedDomainId] = useState<string>("");
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const { data: domains, isLoading: domainsLoading } = useQuery({
    queryKey: ["domains"],
    queryFn: fetchDomains,
  });

  const { data: snippetData, isLoading: snippetLoading } = useQuery({
    queryKey: ["snippet", selectedDomainId],
    queryFn: () => fetchSnippet(selectedDomainId),
    enabled: !!selectedDomainId,
  });

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSnippet(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopiedSnippet(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const currentSnippet = snippetData?.snippet ?? "";
  const currentGuide = PLATFORMS.find((p) => p.key === selectedPlatform)!;

  if (domainsLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Install Script</h1>
        <p className="text-sm text-muted mt-1">
          Add the VeriClick anti-bot script to your website.
        </p>
      </div>

      {/* Domain selector */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900 mb-3">1. Select your domain</h2>
        <p className="text-xs text-muted mb-4">
          Choose a verified domain to generate the correct installation snippet.
        </p>
        <select
          value={selectedDomainId}
          onChange={(e) => setSelectedDomainId(e.target.value)}
          className="w-full bg-slate-50 border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black transition-colors"
        >
          <option value="">Select a domain…</option>
          {domains?.map((d) => (
            <option key={d.id} value={d.id} disabled={!d.verified}>
              {d.domain} {!d.verified ? '(unverified)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Platform selector */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900 mb-3">2. Choose your platform</h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {PLATFORMS.map((p) => (
            <button
              key={p.key}
              onClick={() => setSelectedPlatform(p.key)}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl text-xs font-bold transition-all ${selectedPlatform === p.key
                  ? 'bg-black text-white'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
            >
              <span className="text-lg">{p.icon}</span>
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Snippet */}
      {selectedDomainId && (
        <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="bg-neutral-900 p-2 rounded-xl">
                <HugeiconsIcon icon={CodeIcon} className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {currentGuide.name} Snippet
                </h2>
                <p className="text-sm text-muted">{currentGuide.description}</p>
              </div>
            </div>
            {currentSnippet && (
              <div className="flex items-center gap-2">
                {selectedPlatform === 'cpanel' && snippetData?.apiBase && (
                  <>
                    <a
                      href={`${snippetData.apiBase}/shield.js/download`}
                      download
                      className="bg-white hover:bg-neutral-100 text-slate-700 border border-neutral-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <HugeiconsIcon icon={Download01Icon} className="w-3.5 h-3.5" />
                      Download .js File
                    </a>
                    <a
                      href={`${snippetData.apiBase}/shield/prepend.php/download?api_key=${snippetData.apiKey}`}
                      download
                      className="bg-white hover:bg-neutral-100 text-slate-700 border border-neutral-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <HugeiconsIcon icon={Download01Icon} className="w-3.5 h-3.5" />
                      Download prepend.php
                    </a>
                    <a
                      href={`${snippetData.apiBase}/shield/user-ini/download?api_key=${snippetData.apiKey}`}
                      download
                      className="bg-white hover:bg-neutral-100 text-slate-700 border border-neutral-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <HugeiconsIcon icon={Download01Icon} className="w-3.5 h-3.5" />
                      Download .user.ini
                    </a>
                  </>
                )}
                <button
                  onClick={() => handleCopy(currentSnippet)}
                  className="bg-white hover:bg-neutral-100 text-slate-700 border border-neutral-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  {copiedSnippet ? (
                    <>
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-3.5 h-3.5 text-green-500" />
                      Copied
                    </>
                  ) : (
                    <>
                      <HugeiconsIcon icon={Copy01Icon} className="w-3.5 h-3.5" />
                      Copy
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
          {snippetLoading ? (
            <div className="bg-neutral-900 text-neutral-400 text-xs font-mono p-4 rounded-xl text-center">
              Loading snippet…
            </div>
          ) : (
            <pre className="bg-neutral-900 text-neutral-100 text-xs font-mono p-4 rounded-xl overflow-x-auto">
              <code>{currentSnippet}</code>
            </pre>
          )}
        </div>
      )}

      {/* Platform-specific guide */}
      {selectedDomainId && (
        <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-3">
            {currentGuide.icon} {currentGuide.name} — Step by Step
          </h3>
          {selectedPlatform === 'cpanel' && currentGuide.altMethods ? (
            <>
              <div className="flex gap-1 mb-4 bg-slate-100 rounded-lg p-1">
                {currentGuide.altMethods.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setCpanelMethod(m.id)}
                    className={`flex-1 text-[11px] font-bold px-3 py-1.5 rounded-md transition-all ${
                      cpanelMethod === m.id
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {m.label}
                    {m.id === 'dot-user-ini' && <span className="ml-1 text-[9px] text-emerald-600 font-extrabold">★</span>}
                  </button>
                ))}
              </div>
              {(() => {
                const method = currentGuide.altMethods!.find((m) => m.id === cpanelMethod) || currentGuide.altMethods![0]
                return (
                  <>
                    <ol className="space-y-3">
                      {method.steps.map((step, i) => (
                        <li key={i} className="flex gap-3">
                          <span className="bg-slate-100 text-slate-600 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                            {i + 1}
                          </span>
                          <span className="text-sm text-slate-700">{step}</span>
                        </li>
                      ))}
                    </ol>
                    <div className="mt-4">
                      <div className="flex items-center justify-between bg-neutral-900 rounded-lg px-3 py-2">
                        <code className="text-xs font-mono text-neutral-100 break-all">{method.iniSnippet}</code>
                        <button
                          onClick={() => handleCopy(method.iniSnippet)}
                          className="text-neutral-400 hover:text-white text-[10px] font-bold uppercase tracking-wider ml-2 shrink-0"
                        >
                          {copiedSnippet ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <p className="mt-1.5 text-[11px] text-amber-700 leading-relaxed">
                        {method.iniHint}
                      </p>
                    </div>
                  </>
                )
              })()}
            </>
          ) : (
            <>
              <ol className="space-y-3">
                {currentGuide.detailedSteps.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="bg-slate-100 text-slate-600 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-sm text-slate-700">{step}</span>
                  </li>
                ))}
              </ol>
              {currentGuide.iniSnippet && (
                <div className="mt-4">
                  <div className="flex items-center justify-between bg-neutral-900 rounded-lg px-3 py-2">
                    <code className="text-xs font-mono text-neutral-100 break-all">{currentGuide.iniSnippet}</code>
                    <button
                      onClick={() => handleCopy(currentGuide.iniSnippet!)}
                      className="text-neutral-400 hover:text-white text-[10px] font-bold uppercase tracking-wider ml-2 shrink-0"
                    >
                      {copiedSnippet ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  {currentGuide.iniHint && (
                    <p className="mt-1.5 text-[11px] text-amber-700 leading-relaxed">
                      {currentGuide.iniHint}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* How it works */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-6 sm:p-8 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 mb-6">How it works</h2>
        <div className="space-y-6">
          {[
            {
              number: 1,
              title: "Paste the script",
              description: "Add the VeriClick snippet to your site's <head>. It runs on every page load.",
            },
            {
              number: 2,
              title: "Automatic detection",
              description: "The script collects device signals and checks them against our bot detection engine.",
            },
            {
              number: 3,
              title: "Protection is live",
              description: "Bots are blocked or challenged based on your shield settings. No action needed from you.",
            },
          ].map((step) => (
            <div key={step.number} className="flex gap-4">
              <div className="bg-neutral-900 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0">
                {step.number}
              </div>
              <div>
                <h3 className="font-bold text-slate-900">{step.title}</h3>
                <p className="text-sm text-muted mt-1">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
