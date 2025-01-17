import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import 'highlight.js/styles/github.css'; // Light theme
import 'highlight.js/styles/github-dark.css'; // Dark theme

const MarkdownRenderer = ({ content }) => {
  const isDarkMode = document.documentElement.classList.contains('dark');

  return (
    <ReactMarkdown
      children={content}
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex, rehypeHighlight]}
      components={{
        code({ node, inline, className, children, ...props }) {
          return !inline ? (
            <pre className={`${className} ${isDarkMode ? 'dark' : ''}`} {...props}>
              <code className={className}>{children}</code>
            </pre>
          ) : (
            <code className={`${className} ${isDarkMode ? 'dark' : ''}`} {...props}>
              {children}
            </code>
          );
        },
        img: ({ node, ...props }) => (
          <img {...props} className="inline-block max-w-full h-auto" />
        ),
        a: ({ node, ...props }) => (
          <a {...props} target="_blank" rel="noopener noreferrer" />
        ),
      }}
    />
  );
};

export default MarkdownRenderer;
