"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { createPublicClient, createWalletClient, custom, http, parseEther } from "viem";

type ScrapEntry = {
  username: string;
  pfp: string;
  message: string;
  signature: string;
  wallet: string;
  txHash: string;
  createdAt: number;
  memoryPhoto?: string;
};

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_RITUAL_CHAIN_ID ?? "1979");
const RPC_URL = process.env.NEXT_PUBLIC_RITUAL_RPC_URL ?? "https://rpc.ritualfoundation.org";
const SCRAPBOOK_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_SCRAPBOOK_CONTRACT_ADDRESS as `0x${string}` | undefined;
const SCRAPBOOK_RECEIVER_ADDRESS = process.env.NEXT_PUBLIC_SCRAPBOOK_RECEIVER_ADDRESS as `0x${string}` | undefined;
const CHAIN_HEX = `0x${CHAIN_ID.toString(16)}`;

const scrapbookAbi = [
  {
    type: "function",
    name: "submitScrapbook",
    stateMutability: "payable",
    inputs: [
      { name: "authorUsername", type: "string" },
      { name: "authorXUserId", type: "string" },
      { name: "authorPfpUrl", type: "string" },
      { name: "message", type: "string" },
    ],
    outputs: [],
  },
] as const;

export default function Home() {
  const [wallet, setWallet] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const [isBookOpen, setIsBookOpen] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipDirection, setFlipDirection] = useState<"next" | "prev">("next");
  const [pendingPage, setPendingPage] = useState<number | null>(null);
  const [entries, setEntries] = useState<ScrapEntry[]>([]);
  const [showComposer, setShowComposer] = useState(false);
  const [composeUsername, setComposeUsername] = useState("");
  const [composeMessage, setComposeMessage] = useState("");
  const [composePfp, setComposePfp] = useState("");
  const [composeSignature, setComposeSignature] = useState("");
  const [tiltX, setTiltX] = useState(0);
  const [tiltY, setTiltY] = useState(0);

  useEffect(() => {
    const raw = window.localStorage.getItem("ritual_scrapbook_entries_v1");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as ScrapEntry[];
      if (Array.isArray(parsed)) {
        setEntries(parsed);
      }
    } catch {
      // ignore malformed local data
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("ritual_scrapbook_entries_v1", JSON.stringify(entries));
  }, [entries]);

  async function connectWallet() {
    setStatus("");
    if (!window.ethereum) {
      setStatus("Wallet not found. Install MetaMask or another injected wallet.");
      return;
    }
    try {
      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts?.length) {
        setStatus("No wallet account returned.");
        return;
      }
      const chainHex = (await window.ethereum.request({ method: "eth_chainId" })) as string;
      const currentChain = Number.parseInt(chainHex, 16);
      if (currentChain !== CHAIN_ID) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: CHAIN_HEX }],
          });
        } catch (switchError) {
          const message = String(switchError);
          const shouldAddChain = message.includes("4902") || message.toLowerCase().includes("unrecognized chain");
          if (shouldAddChain) {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: CHAIN_HEX,
                  chainName: "Ritual Chain",
                  nativeCurrency: {
                    name: "Ritual",
                    symbol: "RITUAL",
                    decimals: 18,
                  },
                  rpcUrls: ["https://rpc.ritualfoundation.org"],
                  blockExplorerUrls: ["https://explorer.ritualfoundation.org"],
                },
              ],
            });
            await window.ethereum.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: CHAIN_HEX }],
            });
          } else {
            throw switchError;
          }
        }
      }
      setWallet(accounts[0]);
      setStatus("Wallet connected.");
    } catch (error) {
      setStatus(`Wallet connect failed: ${String(error)}`);
    }
  }


  async function sealAndAddPage() {
    setStatus("");
    if (!window.ethereum) {
      setStatus("Wallet not found.");
      return;
    }
    if (!wallet) {
      setStatus("Connect your wallet first.");
      return;
    }
    const cleanUsername = composeUsername.trim().replace(/^@+/, "");
    if (!cleanUsername) {
      setStatus("Please enter username.");
      return;
    }
    if (composeMessage.trim().length < 3) {
      setStatus("Please write your story.");
      return;
    }

    const fee = "0.001";
    const value = parseEther(fee);

    setSubmitting(true);
    try {
      const payload = `Ritual Scrapbook Signature\nUsername: @${cleanUsername}\nMessage: ${composeMessage.trim()}\nTime: ${new Date().toISOString()}`;
      const sig = (await window.ethereum.request({
        method: "personal_sign",
        params: [payload, wallet],
      })) as string;
      setComposeSignature(sig);

      const walletClient = createWalletClient({ transport: custom(window.ethereum) });
      const [account] = await walletClient.getAddresses();
      let hash: `0x${string}`;
      const authorPfp = composePfp || "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png";

      if (SCRAPBOOK_CONTRACT_ADDRESS) {
        hash = await walletClient.writeContract({
          chain: undefined,
          address: SCRAPBOOK_CONTRACT_ADDRESS,
          abi: scrapbookAbi,
          functionName: "submitScrapbook",
          account,
          args: [cleanUsername.toLowerCase(), `manual-${Date.now()}`, authorPfp, composeMessage.trim()],
          value,
        });
      } else {
        const receiver = SCRAPBOOK_RECEIVER_ADDRESS ?? account;
        hash = await walletClient.sendTransaction({ chain: undefined, account, to: receiver, value });
      }

      const publicClient = createPublicClient({ transport: http(RPC_URL) });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        setStatus("Transaction failed.");
        return;
      }

      const nextEntry: ScrapEntry = {
        username: cleanUsername,
        pfp: authorPfp,
        message: composeMessage.trim(),
        signature: sig,
        wallet,
        txHash: hash,
        createdAt: Date.now(),
      };
      setEntries((prev) => {
        const updated = [...prev, nextEntry];
        // Page mapping: 0 cover, 1 invitation, 2 instructions, 3+ user pages
        const newEntryPage = updated.length + 2;
        setIsBookOpen(true);
        setCurrentPage(newEntryPage);
        return updated;
      });

      setShowComposer(false);
      setComposeUsername("");
      setComposeMessage("");
      setComposePfp("");
      setComposeSignature("");
      setStatus(`Signed, paid ${fee} RITUAL on testnet, and added to scrapbook.`);
    } catch (error) {
      setStatus(`Seal failed: ${String(error)}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }


  function flipTo(page: number, direction: "next" | "prev") {
    const maxPage = Math.max(3, entries.length + 2);
    if (isFlipping || page === currentPage || page < 0 || page > maxPage) return;
    if (!isBookOpen) {
      setIsBookOpen(true);
      setCurrentPage(Math.max(page, 1));
      return;
    }
    setFlipDirection(direction);
    setPendingPage(page);
    setIsFlipping(true);
    window.setTimeout(() => {
      setCurrentPage(page);
      setPendingPage(null);
      setIsFlipping(false);
    }, 660);
  }

  function nextPage() {
    const maxPage = Math.max(3, entries.length + 2);
    flipTo(Math.min(currentPage + 1, maxPage), "next");
  }

  function prevPage() {
    if (isFlipping) return;
    if (isBookOpen && currentPage <= 1) {
      setIsBookOpen(false);
      setCurrentPage(0);
      return;
    }
    flipTo(Math.max(currentPage - 1, 0), "prev");
  }

  const showSpread = isBookOpen;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0d2a20] bg-[radial-gradient(circle_at_30%_12%,rgba(82,182,126,0.25),transparent_42%),repeating-linear-gradient(90deg,#112f24_0,#112f24_12px,#0e271e_12px,#0e271e_26px)] px-4 py-8 text-stone-100">
      <div className="pointer-events-none absolute inset-0">
        <Image
          src="/ritual-logo.jpg"
          alt="Ritual glow background"
          fill
          className="object-contain opacity-25 blur-2xl [transform:scale(1.18)]"
          priority
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(104,214,150,0.2)_0%,rgba(14,39,30,0.78)_62%,rgba(9,25,19,0.92)_100%)]" />
      </div>
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-5">
        <p className="text-center text-sm tracking-[0.28em] text-emerald-100/80">RITUAL SCRAPBOOK · TESTNET</p>

        <div
          className="relative w-full max-w-[980px]"
          style={{ perspective: "2600px" }}
          onMouseMove={(e) => {
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width - 0.5;
            const y = (e.clientY - rect.top) / rect.height - 0.5;
            setTiltY(x * 4);
            setTiltX(y * -3);
          }}
          onMouseLeave={() => {
            setTiltX(0);
            setTiltY(0);
          }}
        >
          <button
            onClick={() => {
              setShowComposer(true);
            }}
            className="absolute -right-2 -top-2 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#1e8f61] text-4xl text-white shadow-[0_16px_32px_rgba(17,83,58,0.45)] transition-all duration-300 hover:scale-105 hover:bg-[#197a53] hover:shadow-[0_20px_40px_rgba(17,83,58,0.55)]"
            aria-label="Add Scrapbook Entry"
          >
            +
          </button>
          <div
            className="relative mx-auto h-[640px] w-full max-w-[940px] transition-transform duration-300 ease-out"
            style={{ transform: `rotateX(${tiltX}deg) rotateY(${tiltY}deg)` }}
          >
            <div className="absolute inset-y-3 left-8 w-7 rounded-l-lg bg-black/45 blur-[1px]" />

            <div className={`absolute inset-0 rounded-[22px] border border-amber-900/40 bg-[linear-gradient(110deg,#ebddc1_0%,#e6d6b6_52%,#dbc59e_100%)] p-6 text-[#2e2419] shadow-[0_36px_90px_rgba(0,0,0,0.62)] transition-opacity duration-300 md:p-8 ${showSpread ? "opacity-100" : "opacity-0"}`}>
              <div className="grid h-full grid-cols-2 gap-4">
                <section className="rounded-xl border border-[#c0ab83] bg-[linear-gradient(120deg,#f6ecd7_0%,#f0e2c5_100%)] p-5">
                  <div className="h-full rounded-md border border-[#c8b492] bg-[repeating-linear-gradient(to_bottom,rgba(72,117,92,0.15)_0px,rgba(72,117,92,0.15)_1px,transparent_1px,transparent_54px)] px-6 py-5">
                    <h3 className="text-4xl font-semibold uppercase tracking-tight text-[#1d5a3d]">Ritual Scrapbook</h3>
                    <p className="mt-5 text-xl italic leading-[1.5] text-[#244f3c]">
                      A curated ledger of community stories, sealed on Ritual Testnet page by page.
                    </p>
                  </div>
                </section>
                <section className="rounded-xl border border-[#c0ab83] bg-[linear-gradient(120deg,#f8efd9_0%,#f2e5cb_100%)] p-5">
                  {currentPage <= 1 ? (
                    <div>
                      <h2 className="text-5xl font-semibold text-[#1d5a3d]">The Invitation</h2>
                      <p className="mt-5 text-3xl italic leading-[1.45] text-[#244f3c]">
                        Every chronicle begins with a signature. Connect your wallet, compose your entry, and seal your page into the Ritual Scrapbook.
                      </p>
                      <p className="mt-4 text-lg tracking-wide text-[#2d6d4f]">
                        A professional community archive authored directly on testnet.
                      </p>
                    </div>
                  ) : currentPage === 2 ? (
                    <div>
                      <h2 className="text-5xl font-semibold text-[#1d5a3d]">Instructions</h2>
                      <div className="mt-5 space-y-2 text-lg text-[#2a674b]">
                        <p>1. Click the <strong>+</strong> icon.</p>
                        <p>2. Add username, avatar, and your story.</p>
                        <p>3. Sign and select <strong>Seal & Add Page</strong>.</p>
                        <p>4. Turn the page to browse community entries.</p>
                      </div>
                    </div>
                  ) : entries.length === 0 ? (
                    <div>
                      <h2 className="text-5xl font-semibold">Community Pages</h2>
                      <p className="mt-4 text-[#5e4a35]">No pages yet. Be the first one with the + button.</p>
                    </div>
                  ) : (
                    <div>
                      <h2 className="text-4xl font-semibold">Page {currentPage - 2}</h2>
                      <div className="mt-4 rounded-md border border-[#bca783] bg-white/60 p-3">
                        <div className="flex items-center gap-3">
                          <Image
                            src={`/api/avatar?url=${encodeURIComponent(entries[Math.min(currentPage - 3, entries.length - 1)].pfp)}`}
                            alt={entries[Math.min(currentPage - 3, entries.length - 1)].username}
                            width={44}
                            height={44}
                            className="rounded-full"
                          />
                          <div>
                            <p className="font-semibold">@{entries[Math.min(currentPage - 3, entries.length - 1)].username}</p>
                            <p className="text-xs text-[#6a563f]">{new Date(entries[Math.min(currentPage - 3, entries.length - 1)].createdAt).toLocaleString()}</p>
                          </div>
                        </div>
                        <p className="mt-3 text-[#3f3122]">{entries[Math.min(currentPage - 3, entries.length - 1)].message}</p>
                        {entries[Math.min(currentPage - 3, entries.length - 1)].memoryPhoto && (
                          <Image
                            src={entries[Math.min(currentPage - 3, entries.length - 1)].memoryPhoto as string}
                            alt="Memory"
                            width={320}
                            height={190}
                            className="mt-3 h-auto w-full rounded-md border border-[#bca783] object-cover"
                          />
                        )}
                      </div>
                    </div>
                  )}
                  {status && <p className="mt-4 text-sm text-[#4c3a28]">{status}</p>}
                </section>
              </div>
            </div>

            <button
              onClick={nextPage}
              className={`absolute inset-y-0 left-0 z-20 w-full origin-left rounded-[20px] border border-emerald-900/45 bg-[radial-gradient(circle_at_65%_55%,#1e8f61_0%,#1a6f50_46%,#144f39_100%)] p-8 text-left text-emerald-50 shadow-[0_35px_90px_rgba(5,27,20,0.72)] transition-[transform,box-shadow,width] duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] ${
                isBookOpen
                  ? "pointer-events-none w-[48%] [transform:translateX(-10px)_rotateY(-176deg)] shadow-[0_15px_40px_rgba(0,0,0,0.45)]"
                  : "w-full [transform:rotateY(0deg)]"
              }`}
              style={{ transformStyle: "preserve-3d", backfaceVisibility: "hidden" }}
            >
              <div className="relative flex h-full flex-col items-center justify-center rounded-xl border-2 border-emerald-200/35 p-5 text-center">
                <p className="absolute left-5 top-5 text-sm tracking-[0.2em] text-emerald-100/85">COMMUNITY EDITION · 2026</p>
                <h1 className="max-w-[520px] font-['Bodoni_MT','Didot','Times_New_Roman',serif] text-7xl font-semibold leading-[0.86] tracking-tight text-emerald-50">
                  Ritual Scrapbook
                </h1>
                <p className="mt-6 text-3xl font-light text-emerald-100/90">Testnet Memory Book</p>
                <p className="absolute bottom-12 text-base italic text-emerald-100/80">Turn the page...</p>
              </div>
            </button>

            {isFlipping && pendingPage !== null && (
              <div
                className={`pointer-events-none absolute inset-y-4 left-1/2 z-20 w-1/2 origin-left rounded-r-xl border border-[#cab38b]/80 bg-[linear-gradient(110deg,#f7ecd6_0%,#efdfbf_55%,#e4cd9f_100%)] ${
                  flipDirection === "next"
                    ? "animate-[page-flip-wave-next_620ms_cubic-bezier(0.2,0.65,0.24,1)_forwards]"
                    : "animate-[page-flip-wave-prev_620ms_cubic-bezier(0.2,0.65,0.24,1)_forwards]"
                }`}
                style={{ backfaceVisibility: "hidden", transformStyle: "preserve-3d" }}
              >
                <div
                  className={`absolute inset-0 rounded-r-xl bg-[linear-gradient(90deg,rgba(56,37,20,0.2),rgba(56,37,20,0.03)_25%,rgba(255,255,255,0.02)_70%)] ${
                    flipDirection === "next"
                      ? "animate-[page-curl-next_620ms_cubic-bezier(0.2,0.65,0.24,1)_forwards]"
                      : "animate-[page-curl-prev_620ms_cubic-bezier(0.2,0.65,0.24,1)_forwards]"
                  }`}
                />
                <div
                  className="absolute inset-y-0 left-0 w-[48%] bg-[linear-gradient(92deg,rgba(255,255,255,0),rgba(255,255,255,0.5),rgba(255,255,255,0))] animate-[page-light-sweep_620ms_cubic-bezier(0.2,0.65,0.24,1)_forwards]"
                />
              </div>
            )}

            <button onClick={prevPage} disabled={!isBookOpen || isFlipping} className="absolute -left-3 top-1/2 z-30 h-14 w-14 -translate-y-1/2 rounded-full border border-emerald-100/20 bg-[#06291e]/70 text-3xl text-emerald-50 backdrop-blur-sm transition-all duration-200 hover:scale-105 hover:bg-[#093728] disabled:opacity-30">‹</button>
            <button onClick={nextPage} disabled={isFlipping || (isBookOpen && currentPage >= Math.max(3, entries.length + 2))} className="absolute -right-3 top-1/2 z-30 h-14 w-14 -translate-y-1/2 rounded-full border border-emerald-100/20 bg-[#06291e]/70 text-3xl text-emerald-50 backdrop-blur-sm transition-all duration-200 hover:scale-105 hover:bg-[#093728] disabled:opacity-30">›</button>
          </div>
        </div>
        {showComposer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-2xl border border-emerald-900/45 bg-[linear-gradient(140deg,#efe6d1_0%,#e6dbc1_100%)] text-[#1f3d30] shadow-[0_24px_70px_rgba(0,0,0,0.45)]">
              <div className="flex items-center justify-between rounded-t-2xl bg-[linear-gradient(90deg,#176245_0%,#1e8f61_100%)] px-5 py-3 text-[#ecfff6]">
                <h3 className="font-['Bodoni_MT','Didot','Times_New_Roman',serif] text-4xl font-semibold leading-none">Add to Ritual Scrapbook</h3>
                <button onClick={() => setShowComposer(false)} className="text-3xl leading-none text-emerald-50/90 hover:text-white">×</button>
              </div>
              <div className="grid gap-4 p-5">
                <div className="flex items-center gap-3">
                  <button onClick={connectWallet} className="rounded-md bg-[#1a6f50] px-3 py-2 text-sm font-semibold text-[#ecfff6] shadow-[0_8px_18px_rgba(17,83,58,0.3)] hover:bg-[#155b42]">
                    {wallet ? "Wallet Connected" : "Connect Wallet"}
                  </button>
                  <p className="text-xs text-[#45624f]">{wallet ? `${wallet.slice(0, 8)}...${wallet.slice(-6)}` : "No wallet connected"}</p>
                </div>
                <div className="flex flex-col items-center">
                  <label className="text-xs font-semibold tracking-[0.16em] text-[#2e5a45]">PFP</label>
                  <div className="mt-2 h-28 w-28 overflow-hidden rounded-full border-2 border-dashed border-emerald-900/35 bg-white/50">
                    {composePfp ? (
                      <Image src={composePfp} alt="PFP preview" width={112} height={112} className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <label className="mt-2 inline-block cursor-pointer rounded-md border border-emerald-900/30 bg-white/65 px-3 py-1 text-sm font-semibold text-[#2e5a45]">
                    Upload PFP
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setComposePfp(await fileToDataUrl(file));
                      }}
                    />
                  </label>
                  <div className="mt-3 w-full">
                    <label className="text-sm font-semibold text-[#2b5843]">X Username</label>
                    <input
                      value={composeUsername}
                      onChange={(e) => setComposeUsername(e.target.value)}
                      placeholder="Enter your username..."
                      className="mt-2 w-full rounded-md border border-emerald-900/30 bg-white/80 px-3 py-2 text-[#214534] placeholder:text-[#91a499]"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-semibold text-[#2b5843]">Your Ritual Story</label>
                  <textarea
                    value={composeMessage}
                    onChange={(e) => setComposeMessage(e.target.value)}
                    rows={5}
                    placeholder="Pour your heart out..."
                    className="mt-2 w-full resize-none rounded-md border border-emerald-900/30 bg-white/80 px-3 py-2 text-[#214534] placeholder:text-[#91a499]"
                  />
                </div>

                <button
                  onClick={sealAndAddPage}
                  disabled={submitting}
                  className="rounded-md bg-[linear-gradient(90deg,#1a6f50_0%,#1f8f63_100%)] px-4 py-3 font-['Bodoni_MT','Didot','Times_New_Roman',serif] text-4xl font-semibold text-[#f2fff9] shadow-[0_12px_24px_rgba(16,73,52,0.3)] disabled:opacity-60"
                >
                  {submitting ? "Signing & Paying..." : "Sign"}
                </button>
                <p className="text-center text-xs text-[#2d6b4e]">A fixed testnet fee of 0.001 RITUAL is charged on submit.</p>
                {composeSignature && <p className="text-xs text-[#2d6b4e]">Signed ✓</p>}
              </div>
            </div>
          </div>
        )}
        <p className="text-xs tracking-[0.18em] text-emerald-100/70">FRONT PAGE GUIDE</p>
      </div>
    </main>
  );
}
