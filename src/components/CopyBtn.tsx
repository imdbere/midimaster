import { createSignal, Show } from 'solid-js'
import { writeClipboard } from '@solid-primitives/clipboard'
import { Copy, Check } from 'lucide-solid'

export function CopyBtn(props: { text: string }) {
  const [copied, setCopied] = createSignal(false)
  function copy() {
    const finish = () => { setCopied(true); setTimeout(() => setCopied(false), 2000) }
    writeClipboard(props.text).then(finish).catch(finish)
  }
  return (
    <button class="da-icon-btn" classList={{ copied: copied() }} onClick={copy} title="Copy">
      <Show when={copied()} fallback={<Copy size={15} />}>
        <Check size={15} />
      </Show>
    </button>
  )
}
