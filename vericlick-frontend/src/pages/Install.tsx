import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  CodeIcon,
  Copy01Icon,
  CheckmarkCircle02Icon,
  Globe02Icon,
} from "@hugeicons/core-free-icons";
import toast from "react-hot-toast";
import { fetchWorkspace } from "@/api/workspace";
import { apiClient } from "@/api/client";
import { DashboardSkeleton } from "@/components/ui/DashboardSnippet";

const API_BASE = (apiClient.defaults.baseURL || "").replace(/\/$/, "");

interface PlatformGuide {
  name: string;
  icon: string;
  description: string;
  snippet: string;
}

export default function InstallPage() {
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  const { data: workspace, isLoading } = useQuery({
    queryKey: ["workspace"],
    queryFn: fetchWorkspace,
  });

  const apiKey = workspace?.trackerSecret || "";

  const getSnippet = (platform: string) => {
    if (platform === "nextjs") {
      return `<!-- VeriClick Bot Protection -->
<script
  src="${API_BASE}/shield.js"
  data-api-key="${apiKey}"
  defer
></script>`;
    }

    if (platform === "wordpress") {
      return `<!-- VeriClick Bot Protection -->
<script src="${API_BASE}/shield.js" data-api-key="${apiKey}" defer></script>`;
    }

    if (platform === "shopify") {
      return `<!-- VeriClick Bot Protection -->
<script src="${API_BASE}/shield.js" data-api-key="${apiKey}" defer></script>`;
    }

    if (platform === "webflow") {
      return `<!-- VeriClick Bot Protection -->
<script src="${API_BASE}/shield.js" data-api-key="${apiKey}" defer></script>`;
    }

    return `<!-- VeriClick Bot Protection -->
<script src="${API_BASE}/shield.js" data-api-key="${apiKey}" defer></script>`;
  };

  const mainSnippet = `<!-- VeriClick Bot Protection -->
<script
  src="${API_BASE}/shield.js"
  data-api-key="${apiKey}"
  defer
></script>`;

  const platformGuides: PlatformGuide[] = [
    {
      name: "HTML",
      icon: "🌐",
      description: "Paste before the closing </head> tag",
      snippet: getSnippet("html"),
    },
    {
      name: "WordPress",
      icon: "📝",
      description: "Use the Insert Headers and Footers plugin",
      snippet: getSnippet("wordpress"),
    },
    {
      name: "Shopify",
      icon: "🛒",
      description: "Online Store > Edit Code > theme.liquid > before </head>",
      snippet: getSnippet("shopify"),
    },
    {
      name: "Webflow",
      icon: "🎨",
      description: "Site Settings > Custom Code > Head Code",
      snippet: getSnippet("webflow"),
    },
    {
      name: "Next.js",
      icon: "⚡",
      description: "Add to _document.js or layout.tsx head",
      snippet: getSnippet("nextjs"),
    },
  ];

  const handleCopy = async (snippet: string, name: string) => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopiedSnippet(name);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopiedSnippet(null), 2000);
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
        "Signals are sent to VeriClick's servers where our AI-powered engine analyzes the data to determine if the visitor is a human or a bot.",
    },
    {
      number: 3,
      title: "Page Protection",
      description:
        "If a bot is detected, the page is blocked from loading. If the visitor is human, the page loads normally with no interruption.",
    },
  ];

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Install Script</h1>
        <p className="text-sm text-muted mt-1">
          Add the VeriClick script to your website to enable bot protection.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-border p-6 sm:p-8 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-neutral-900 p-2 rounded-xl">
              <HugeiconsIcon
                icon={CodeIcon}
                className="w-5 h-5 text-white"
              />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Shield.js Snippet
              </h2>
              <p className="text-sm text-muted">
                Copy and paste this code into your website's{" "}
                <code className="bg-neutral-100 px-1.5 py-0.5 rounded text-xs font-mono">
                  &lt;head&gt;
                </code>{" "}
                tag.
              </p>
            </div>
          </div>
          <button
            onClick={() => handleCopy(mainSnippet, "main")}
            className="bg-white hover:bg-neutral-100 text-slate-700 border border-border px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            {copiedSnippet === "main" ? (
              <>
                <HugeiconsIcon
                  icon={CheckmarkCircle02Icon}
                  className="w-3.5 h-3.5 text-green-500"
                />
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
          <code>{mainSnippet}</code>
        </pre>
      </div>

      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-neutral-900 p-2 rounded-xl">
            <HugeiconsIcon
              icon={Globe02Icon}
              className="w-5 h-5 text-white"
            />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Platform Guides
            </h2>
            <p className="text-sm text-muted">
              Select your platform for installation instructions.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {platformGuides.map((guide) => (
            <div
              key={guide.name}
              className="bg-white rounded-2xl border border-border p-6 shadow-sm"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{guide.icon}</span>
                  <div>
                    <h3 className="font-bold text-slate-900">{guide.name}</h3>
                    <p className="text-sm text-muted">{guide.description}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleCopy(guide.snippet, guide.name)}
                  className="bg-white hover:bg-neutral-100 text-slate-700 border border-border px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  {copiedSnippet === guide.name ? (
                    <>
                      <HugeiconsIcon
                        icon={CheckmarkCircle02Icon}
                        className="w-3.5 h-3.5 text-green-500"
                      />
                      Copied
                    </>
                  ) : (
                    <>
                      <HugeiconsIcon
                        icon={Copy01Icon}
                        className="w-3.5 h-3.5"
                      />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <pre className="bg-neutral-900 text-neutral-100 text-xs font-mono p-3 rounded-xl overflow-x-auto">
                <code>{guide.snippet}</code>
              </pre>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-border p-6 sm:p-8 shadow-sm">
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
