// Safari kennt bis heute keine asynchrone Iteration ueber einen ReadableStream.
// PDF.js liest die Textebene einer Seite genau so aus, weshalb der PDF-Import
// auf iPhone und iPad mit "undefined is not a function" abbrach, bevor
// ueberhaupt eine Seite ausgewertet war. Der Nachbau stuetzt sich nur auf
// getReader(), das Safari vollstaendig unterstuetzt.
(function(){
  if(typeof ReadableStream==="undefined")return;
  if(ReadableStream.prototype[Symbol.asyncIterator])return;

  function iterate({preventCancel=false}={}){
    const reader=this.getReader();
    return {
      next(){return reader.read();},
      async return(value){
        if(!preventCancel)await reader.cancel().catch(()=>{});
        reader.releaseLock();
        return {done:true,value};
      },
      [Symbol.asyncIterator](){return this;}
    };
  }

  ReadableStream.prototype.values=iterate;
  ReadableStream.prototype[Symbol.asyncIterator]=iterate;
})();
