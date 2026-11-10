import pg from "pg";
/** A row listener with no callback prevents pg from retaining a second raw row array. */
export async function visitDatabaseRows<T>(pool:pg.Pool,text:string,values:unknown[],visit:(row:T)=>void,maxRows=100000,borrowedClient?:pg.PoolClient):Promise<void>{
  const client=borrowedClient||await pool.connect();
  try{
    await new Promise<void>((resolve,reject)=>{
      const query=new pg.Query({text,values});let rows=0,failure:unknown;
      query.on("row",(row:T)=>{
        if(failure)return;
        try{if(++rows>maxRows)throw new Error("Saved data exceeds the read limit.");visit(row);}
        catch(error){failure=error||new Error("Saved data could not be read.");}
      });
      // Drain the result before releasing the connection, even after a visitor failure.
      query.once("error",reject);query.once("end",()=>failure?reject(failure):resolve());
      client.query(query);
    });
  }finally{if(!borrowedClient)client.release();}
}
