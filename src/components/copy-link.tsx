"use client";

import { useState } from "react";

import { CheckIcon, CopyIcon } from "@/components/icons";

export function CopyLink({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setFailed(false);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setFailed(true);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 rounded-[14px] border border-line bg-surface px-3.5 py-2.5">
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12.5px] text-ink-2">
          {value.replace(/^https?:\/\//, "")}
        </span>
        <button type="button" onClick={copy} className="btn-small flex-none">
          {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
          {copied ? "Скопировано" : "Копировать"}
        </button>
      </div>
      {failed ? (
        <p className="caption mt-1.5 text-warn">
          Браузер не дал доступ к буферу. Выделите ссылку и скопируйте вручную.
        </p>
      ) : null}
    </div>
  );
}
