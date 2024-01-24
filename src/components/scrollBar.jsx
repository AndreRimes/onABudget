import styled from 'styled-components';

const StyledContainer = styled.div`
  width: 100%;

 
  /* Track */
  ::-webkit-scrollbar {
    width: 12px;
    border-radius: 6px;
  }

  /* Handle */
  ::-webkit-scrollbar-thumb {
    background-color: #888;
    border-radius: 6px;
  }

  /* Handle on hover */
  ::-webkit-scrollbar-thumb:hover {
    background-color: #555;
  }

  /* Track */
  ::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 6px;

  }

  /* Handle when the scrollbar is dragged */
  ::-webkit-scrollbar-thumb:active {
    background-color: #666;
  }
`;

export default StyledContainer;