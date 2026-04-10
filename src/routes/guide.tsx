import { AppHeader } from "@/app/components/AppHeader";
import { PortalNav } from "@/app/components/PortalNav";
import { UserDropdown } from "@/app/components/UserDropdown";
import { useTheme } from "@/providers/ThemeProvider";
import { createFileRoute, Link } from "@tanstack/react-router";
import Markdown from "react-markdown";
import doc from "@/help.md?raw";
import { Root, Blockquote, Paragraph, Text } from "mdast";
import { Plugin } from "unified";
import { useMemo, type ReactNode } from "react";

export const Route = createFileRoute("/guide")({
  component: RouteComponent,
});

const remarkPureAlerts: Plugin<[], Root> = () => (tree) => {
  tree.children.forEach((node) => {
    // Only process blockquotes
    if (node.type !== "blockquote") return;

    const blockquote = node as Blockquote;

    // Check for paragraph as first child
    const firstPara = blockquote.children[0] as Paragraph;
    if (firstPara?.type !== "paragraph") return;

    // Check for text as first child of that paragraph
    const firstText = firstPara.children[0] as Text;
    if (firstText?.type !== "text") return;

    const match = firstText.value.match(/^\[!(NOTE|IMAGE)\]\s*/i);
    if (match) {
      const type = match[1].toLowerCase();

      blockquote.data = {
        ...blockquote.data,
        hProperties: {
          className: type,
        },
      };

      firstText.value = firstText.value.replace(/^\[!(NOTE|IMAGE)\]\s*/i, "");
    }
  });
};

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function childrenToText(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(childrenToText).join("");
  if (children && typeof children === "object" && "props" in (children as any))
    return childrenToText((children as any).props.children);
  return "";
}

function extractTOC(markdown: string) {
  const headingRegex = /^(#{1,2})\s+(.+)$/gm;
  const toc = [];
  let match;

  while ((match = headingRegex.exec(markdown)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();

    const slug = slugify(text);

    toc.push({ level, text, slug });
  }

  return toc;
}

function RouteComponent() {
  const { settings, updateSettings } = useTheme();

  let toc = useMemo(() => extractTOC(doc), []);

  return (
    <>
      <title>Jumpdoc Creation Guide | ChainMaker</title>
      <div className="flex h-dvh flex-col bg-radial-[at_100%_0%] from-accent2/30 via-canvas to-transparent">
        <AppHeader
          nav={<PortalNav />}
          actions={<UserDropdown />}
          settings={settings}
          onUpdateSettings={updateSettings}
          transparent
        />
        <div className="flex flex-1 min-h-0 flex-col md:flex-row overflow-y-scroll md:overflow-y-auto">
          <div className="contents md:flex flex-col">
            <div className="border border-accent-ring rounded-sm flex flex-col text-sm bg-accent-ring/15 mt-5 mr-5 ml-5 lg:ml-50 pb-1">
              <div className="font-semibold uppercase tracking-widest text-center bg-accent-ring/30 text-accent-ring px-3 py-1 mb-1 text-xs">
                Table of Contents
              </div>
              {toc.map((e) => (
                <a
                  href={`#${e.slug}`}
                  className={`${e.level > 1 ? "pl-8" : "pl-4"} pr-4 pb-1 pt-0.5 text-ink/80 hover:text-accent-ring`}
                >
                  {e.text}
                </a>
              ))}
            </div>
          </div>
          <main className="flex-1 overflow-y-auto contents md:flex">
            <div className="max-w-3xl mt-2 md:mt-0 mx-10 md:mx-0 flex flex-col gap-1 text-sm leading-relaxed text-muted">
              <Markdown
                remarkPlugins={[remarkPureAlerts]}
                components={{
                  h1: ({ children, ...props }) => (
                    <h1
                      id={slugify(childrenToText(children))}
                      className="text-3xl font-bold text-accent2/60 text-center md:text-left"
                      {...props}
                    >
                      {children}
                    </h1>
                  ),
                  h2: ({ children, ...props }) => (
                    <h2
                      id={slugify(childrenToText(children))}
                      className="text-xl font-bold text-accent2 text-center md:text-left"
                      {...props}
                    >
                      {children}
                    </h2>
                  ),
                  h3: (props) => <h3 className="text-accent2 font-bold" {...props} />,
                  p: (props) => <p className="my-1" {...props} />,
                  blockquote: ({ className, ...props }) => (
                    <blockquote
                      className={`border px-4 py-2 my-4 mx-4 rounded self-center ${
                        className?.includes("image") || "max-w-9/10 md:max-w-150"
                      } ${
                        className?.includes("note")
                          ? "border-accent bg-accent-tint"
                          : className?.includes("image")
                            ? "border-2 border-accent-ring bg-white flex flex-row flex-wrap mx:flex-no-wrap items-center justify-center gap-2 [&_img]:max-w-full [&_img]:md:max-w-100"
                            : "border-accent2 bg-accent2-tint"
                      }`}
                      {...props}
                    />
                  ),
                  ul: (props) => (
                    <ul
                      className="list-disc list-inside pl-4 [&_li]:my-3 [&_li]:marker:text-accent"
                      {...props}
                    />
                  ),
                  ol: (props) => (
                    <ol
                      className="-mt-2 leading-tight list-[lower-alpha] list-inside marker:font-semibold  marker:text-ghost pl-4"
                      {...props}
                    />
                  ),
                  li: (props) => (
                    <li
                      className='[&>ul]:pl-15 [&>ul]:list-["⟶\00a0\00a0\00a0"] [&_ul]:text-muted/70'
                      {...props}
                    />
                  ),
                  a: (props) => <a className="text-accent-ring hover:underline" {...props} />,
                  strong: (props) => (
                    <strong className="text-accent-ring/90 font-bold" {...props} />
                  ),
                  em: (props) => <em className="text-ink/60 font-semibold italic" {...props} />,
                  img: (props) => (
                    <div className="flex flex-col">
                      <div className="self-center px-4 py-2 my-4 mx-4 rounded-xl overflow-hidden bg-white relative isolate">
                        <img className="max-w-80 md:max-w-130 select-none" {...props} />
                        <div className="absolute inset-0 bg-accent-ring mix-blend-hue" />
                      </div>
                    </div>
                  ),
                }}
              >
                {doc}
              </Markdown>
              <div className="h-10 opacity-0">_</div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
