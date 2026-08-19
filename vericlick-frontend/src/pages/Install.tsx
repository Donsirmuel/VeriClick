import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  CodeIcon,
  Copy01Icon,
  CheckmarkCircle02Icon,
  Globe02Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import toast from "react-hot-toast";
import { fetchWorkspace, fetchDomains, testInstallation, getVerifyChallenge } from "@/api/workspace";
import { apiClient } from "@/api/client";
import { DashboardSkeleton } from "@/components/ui/DashboardSkeleton";

const API_BASE = (apiClient.defaults.baseURL || "").replace(/\/$/, "");

type Platform = "html" | "wordpress" | "shopify" | "wix" | "squarespace" | "webflow";

interface PlatformGuide {
  key: Platform;
  name: string;
  icon: string;
  description: string;
  detailedSteps: string[];
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
];

export default function InstallPage() {
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>("html");
  const [selectedDomainId, setSelectedDomainId] = useState<string>("");
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [testResult, setTestResult] = useState<{
    installed: boolean;
    hasScriptTag?: boolean;
    hasInitCall?: boolean;
    error?: string;
  } | null>(null);

  const { data: workspace, isLoading } = useQuery({
    queryKey: ["workspace"],
    queryFn: fetchWorkspace,
  });

  const { data: domains, isLoading: domainsLoading } = useQuery({
    queryKey: ["domains"],
    queryFn: fetchDomains,
  });

  const { data: verificationChallenge } = useQuery({
    queryKey: ["verify-challenge", selectedDomainId, "html_meta"],
    queryFn: () => getVerifyChallenge(selectedDomainId, "html_meta"),
    enabled: !!selectedDomainId,
  });

  const testMutation = useMutation({
    mutationFn: testInstallation,
    onSuccess: (data) => {
      setTestResult(data);
      if (data.installed) {
        toast.success("Script detected on your domain!");
      } else {
        toast.error(data.error || "Script not found on your domain");
      }
    },
    onError: (err) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || "Test failed");
    },
  });

  const hasDomain = (domains?.length ?? 0) > 0;
  const apiKey = workspace?.trackerSecret || "";
  const installToken = verificationChallenge?.token || "";

  const selectedDomain = domains?.find((d) => d.id === selectedDomainId);

  const getSnippet = (platform: Platform) => {
    const tokenAttr = installToken ? ` data-install-token="${installToken}"` : "";
    const base = `<!-- VeriClick Bot Protection -->
<script
  src="${API_BASE}/shield.js"
  data-api-key="${apiKey}"${tokenAttr}
  defer
></script>`;

    if (platform === "shopify") {
      return `<!-- VeriClick Bot Protection -->
<script src="${API_BASE}/shield.js" data-api-key="${apiKey}"${tokenAttr} defer></script>`;
    }

    return base;
  };

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

  const steps = [
    {
      number: 1,
      title: "Device Signal Collection",
      description:
        "Our script collects device signals including canvas fingerprint, mouse movement patterns, and screen resolution to build a unique visitor profile.",
    },
    {
      number: 2,
      title: "Bot Analysis",
      description:
        "Signals are sent to VeriClick's servers where our engine analyzes the data to determine if the visitor is a human or a bot.",
    },
    {
      number: 3,
      title: "Page Protection",
      description:
        "If a bot is detected, the page is blocked from loading. If the visitor is human, the page loads normally with no interruption.",
    },
  ];

  if (isLoading || domainsLoading) {
    return <DashboardSkeleton />;
  }

  if (!hasDomain) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <div className="w-20 h-20 bg-neutral-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
          <HugeiconsIcon icon={Globe02Icon} className="w-9 h-9 text-muted" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Register a domain first</h1>
        <p className="text-sm text-muted max-w-md mx-auto leading-relaxed mb-8">
          You need to register and verify at least one domain before you can install the protection script.
          The script won't work on unregistered domains.
        </p>
        <a
          href="/app/domains"
          className="inline-flex items-center gap-2 bg-black hover:bg-neutral-800 text-white px-6 py-3 rounded-xl text-sm font-bold transition-all"
        >
          <HugeiconsIcon icon={Globe02Icon} className="w-4 h-4" />
          Add your first domain
        </a>
      </div>
    );
  }

  const currentSnippet = getSnippet(selectedPlatform);
  const currentGuide = PLATFORMS.find((p) => p.key === selectedPlatform)!;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Install Script</h1>
        <p className="text-sm text-muted mt-1">
          Add the VeriClick script to your website to enable bot protection.
        </p>
      </div>

      {/* Domain selector */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900 mb-3">1. Select Domain</h2>
        <p className="text-xs text-muted mb-4">
          Choose a verified domain to generate the correct installation snippet.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={selectedDomainId}
            onChange={(e) => {
              setSelectedDomainId(e.target.value)
              setTestResult(null)
            }}
            className="flex-1 bg-slate-50 border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black transition-colors"
          >
            <option value="">Select a domain…</option>
            {domains?.map((d) => (
              <option key={d.id} value={d.id} disabled={!d.verified}>
                {d.domain} {!d.verified ? '(unverified)' : ''}
              </option>
            ))}
          </select>
          {selectedDomain && selectedDomain.verified && (
            <button
              onClick={() => {
                setTestResult(null)
                testMutation.mutate(selectedDomainId)
              }}
              disabled={testMutation.isPending}
              className="bg-black hover:bg-neutral-800 text-white px-5 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 whitespace-nowrap"
            >
              <HugeiconsIcon
                icon={testMutation.isPending ? Loading03Icon : CheckmarkCircle02Icon}
                className={`w-4 h-4 ${testMutation.isPending ? 'animate-spin' : ''}`}
              />
              {testMutation.isPending ? 'Testing…' : 'Test Installation'}
            </button>
          )}
        </div>

        {testResult && (
          <div className={`mt-4 p-4 rounded-xl text-sm ${testResult.installed
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
            {testResult.installed ? (
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-5 h-5" />
                <span className="font-bold">Script detected! Protection is active on {selectedDomain?.domain}.</span>
              </div>
            ) : (
              <div>
                <span className="font-bold">Script not found.</span>{' '}
                {testResult.error || 'Make sure you pasted the snippet and deployed your changes, then try again.'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Platform selector */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900 mb-3">2. Choose Platform</h2>
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
        <pre className="bg-neutral-900 text-neutral-100 text-xs font-mono p-4 rounded-xl overflow-x-auto">
          <code>{currentSnippet}</code>
        </pre>
      </div>

      {/* Platform-specific guide */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 mb-3">
          {currentGuide.icon} {currentGuide.name} — Step by Step
        </h3>
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
      </div>

      {/* How it works */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-6 sm:p-8 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 mb-6">How it works</h2>
        <div className="space-y-6">
          {steps.map((step) => (
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
