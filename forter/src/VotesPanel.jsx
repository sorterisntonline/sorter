import { useState } from "react";
import { Vote } from "./Vote";
import { selected_item } from "./App";

export const VotesPanel = ({ votes }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const votesPerPage = 5;
  const pageNumbersToShow = 5;

  // Logic for displaying votes
  const indexOfLastVote = currentPage * votesPerPage;
  const indexOfFirstVote = indexOfLastVote - votesPerPage;
  const currentVotes = votes?.slice(indexOfFirstVote, indexOfLastVote);

  // Logic for displaying page numbers
  const totalPages = Math.ceil(votes?.length / votesPerPage);
  const middlePage = Math.ceil(pageNumbersToShow / 2);
  let startPage = currentPage - middlePage + 1;
  let endPage = currentPage + middlePage - 1;

  if (startPage < 1) {
    startPage = 1;
    endPage = pageNumbersToShow;
  }

  if (endPage > totalPages) {
    endPage = totalPages;
    startPage = totalPages - pageNumbersToShow + 1;
    if (startPage < 1) {
      startPage = 1;
    }
  }

  const pageNumbers = Array.from(
    { length: endPage - startPage + 1 },
    (_, i) => startPage + i
  );

  const handleClick = (pageNumber) => {
    setCurrentPage(pageNumber);
  };

  const handlePrevClick = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextClick = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handleItemClick = (item) => {
    selected_item.value = item;
  };

  if (votes === undefined || votes === null || votes.length === 0) {
    return (
      <table key={2} className="w-full">
        <tbody>
          <tr>
            <td>no votes </td>
          </tr>
        </tbody>
      </table>
    );
  }

  if (votes.length <= votesPerPage) {
    return (
      <table key={2} className="w-full">
        <tbody>
          {votes.map((vote) => (
            <Vote 
              key={vote["id"]} 
              vote={vote} 
              showDelete={true} 
              onItemClick={handleItemClick}
            />
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div className="w-full overflow-visible">
      <table className="w-full">
        <tbody>
          {currentVotes?.map((vote) => (
            <Vote 
              key={vote["id"]} 
              vote={vote} 
              showDelete={true} 
              onItemClick={handleItemClick}
            />
          )) ?? (
            <tr>
              <td> no votes </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="flex justify-center mt-4 mb-8">
        <button
          className="mx-1 px-2 py-1 rounded"
          onClick={handlePrevClick}
          disabled={currentPage === 1}
        >
          Prev
        </button>
        {pageNumbers.map((pageNumber) => (
          <button
            key={pageNumber}
            className={`mx-1 px-2 py-1 ${
              currentPage === pageNumber
                ? "dark:text-white border border-gray-100"
                : "dark:text-white border border-gray-900"
            }`}
            onClick={() => handleClick(pageNumber)}
          >
            {pageNumber}
          </button>
        ))}
        <button
          className="mx-1 px-2 py-1 rounded"
          onClick={handleNextClick}
          disabled={currentPage === totalPages}
        >
          Next
        </button>
      </div>
    </div>
  );
};
