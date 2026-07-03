export const Faq = () => {
  return (
    <div className="page flex max-w-3xl flex-col gap-6 text-sm leading-7 lg:text-base">
      <section>
        <h2 className="mb-2 text-lg font-medium">what is sorter?</h2>
        <p>
          sorter is an opinion aggregation website. discover your own opinion on a topic,
          see your friends&apos; opinions, and combine any combination of opinions into one.
        </p>
      </section>
      <section>
        <h2 className="mb-2 text-lg font-medium">how does sorter do this?</h2>
        <p>
          sorter uses pagerank, but instead of links between websites it uses slider votes
          between items to rank items.
        </p>
      </section>
      <section>
        <h2 className="mb-2 text-lg font-medium">what is the end goal?</h2>
        <p>
          find a consensus opinion on every item on the internet. then the internet can switch
          into becoming based on quality instead of popularity.
        </p>
      </section>
      <a className="text-accent underline" href="https://forms.gle/h1sSGBJAtGkivATH8">
        feedback form
      </a>
    </div>
  );
};
