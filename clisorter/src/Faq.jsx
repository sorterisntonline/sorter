export const Faq = () => {
  return (
    <div className="dark:text-white flex flex-col w-full lg:p-40 py-0">
      <p>Q: What is sorter?</p>
      <p>
        A: Sorter is an opinion aggregation website. It allows you to discover
        your own opinion on a topic, see your friends&lsquo; opinions, and
        combine any combination of opinions into one.
      </p>
      <br />
      <br />
      <p>Q: How does sorter do this?</p>
      <p>
        A: Sorter uses PageRank, an algorithm developed by Google. But instead
        of using links between websites to rank websites, it uses slider votes
        between items to rank items.
      </p>
      <br />
      <br />
      <p>Q: What is an item?</p>
      <p>
        A: An item is any piece of information that can be voted on. It can be a
        link, a picture, a video, a quote, a question, or anything else.
      </p>
      <br />
      <br />
      <p>Q: What is a tag?</p>
      <p>A: A tag is a collection of items. Items can be in multiple tags.</p>
      <br />
      <br />
      <b>Q: How do I use sorter?</b>
      <p>
        A: Find a tag you may be interested in, and click the vote button to
        start voting. Slide the slider towards the item you like more. You can
        also click on the item to see more information about it.
      </p>
      <br />
      <br />
      <b>Q: What is the end goal of sorter?</b>
      <p>
        A: The goal of sorter is to find a consensus opinion on every item on
        the internet. Then the internet can switch into becoming based on
        quality instead of popularity.
      </p>

      <br />
      <br />
      <b>Q: How do I give feedback?</b>
      <a
        className="underline text-blue-500"
        href="https://forms.gle/h1sSGBJAtGkivATH8"
      >
        this google form
      </a>
    </div>
  );
};
