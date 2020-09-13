'use strict';

const http = require('http');
const mysqlx = require('@mysql/xdevapi');

const port = process.env.PORT || 9999;
const statusOk = 200;
//const statusNoContent = 204;
const statusBadRequest = 400;
const statusNotFound = 404;
const statusInternalServerError = 500;
const schema = 'social';

const client = mysqlx.getClient({
  user: 'app',
  password: 'pass',
  host: '0.0.0.0',
  port: 33060
});

function sendResponse(response, {status = statusOk, headers = {}, body = null}) {
  Object.entries(headers).forEach(function ([key, value]) {
    response.setHeader(key, value);
  });
  response.writeHead(status);
  response.end(body);
}

function sendJSON(response, body) {
  sendResponse(response, {
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function map(columns) {
  return row => row.reduce((res, value, i) => ({...res, [columns[i].getColumnLabel()]: value}), {});
}

const methods = new Map();

methods.set('/posts.get', async ({response, db}) => {
  const table = await db.getTable('posts');
  const result = await table.select(['id', 'content', 'likes', 'created'])
    .where('removed = :removed')
    .bind('removed', false)
    .orderBy('created DESC')
    .orderBy('id DESC')
    .execute();

  const data = result.fetchAll();
  result.getAffectedItemsCount();
  const columns = result.getColumns();
  const posts = data.map(map(columns));
  sendJSON(response, posts);
});

methods.set('/posts.getById', async ({response, searchParams, db}) => {
  if (!searchParams.has('id')) {
    sendResponse(response, {status: statusBadRequest});
    return;
  }

  const id = Number(searchParams.get('id'));

  if (Number.isNaN(id)) {
    sendResponse(response, {status: statusBadRequest});
    return;
  }

  const table = await db.getTable('posts');
  const result = await table.select(['id', 'content', 'likes', 'created'])
    .where('id = :id and removed = :removed')
    .bind('id', id)
    .bind('removed', false)
    .execute();
  
    const data = result.fetchAll();
    if (data.length === 0) {
      sendResponse(response, {status: statusNotFound});
      return;
    }

    const columns = result.getColumns();
    const posts = data.map(map(columns));
    sendJSON(response, posts[0]);
});

methods.set('/posts.post', async function ({response, searchParams, db}) {
  if (!searchParams.has('content')) {
    sendResponse(response, {status: statusBadRequest});
    return;
  }

  const content = searchParams.get('content');

  const table = await db.getTable('posts');
  const result = await table.insert(['content'])
  .values(content)
  .execute();
  
  const lastInsertId = result.getAutoIncrementValue();
  const lastRecord = await table.select(['id', 'content', 'likes', 'created'])
  .where('id = :id')
  .bind('id', lastInsertId)
  .execute();

  const data = lastRecord.fetchAll();
  const columns = lastRecord.getColumns();
  const post = data.map(map(columns));
  sendJSON(response, post[0]);
});

methods.set('/posts.edit', async function ({response, searchParams, db}) {
  if (!searchParams.has('id')) {
    sendResponse(response, {status: statusBadRequest});
    return;
  }

  const id = Number(searchParams.get('id'));
  if (Number.isNaN(id)) {
    sendResponse(response, {status: statusBadRequest});
    return;
  }

  if (!searchParams.has('content')) {
    sendResponse(response, {status: statusBadRequest});
    return;
  }
  const content = searchParams.get('content');

  const table = await db.getTable('posts');
  const updateRequest = await table.update()
  .set('content', content)
  .where('id = :id and removed = :removed')
  .bind('id', id)
  .bind('removed', false)
  .execute();

  if (updateRequest.getAffectedItemsCount() === 0){
    sendResponse(response, {status: statusNotFound});
    return;
  }

  const result = await table.select (['id', 'content', 'likes', 'created'])
    .where('id = :id and removed = :removed')
    .bind('id', id)
    .bind('removed', false)
    .execute();

  const data = result.fetchAll();

  const columns = result.getColumns();
  const post = data.map(map(columns));
  sendJSON(response, post[0]);
});

methods.set('/posts.delete', async ({response, searchParams, db}) => {
  if (!searchParams.has('id')) {
    sendResponse(response, {status: statusBadRequest});
    return;
  }

  const id = Number(searchParams.get('id'));
  if (Number.isNaN(id)) {
    sendResponse(response, {status: statusBadRequest});
    return;
  }

  const table = await db.getTable('posts');
  const result = await table.update()
    .set('removed', true)
    .where('id = :id and removed = :removed')
    .bind('id', id)
    .bind('removed', false)
    .execute();

  const removed = result.getAffectedItemsCount();

  if (removed === 0) {
    sendResponse(response, {status: statusNotFound});
    return;
  }

  const resultReq = await table.select(['id', 'content', 'likes', 'created'])
    .where('id = :id')
    .bind('id', id)
    .execute();
    
  const columns = resultReq.getColumns();
  const data = resultReq.fetchAll();
  const post = data.map(map(columns));
  sendJSON(response, post[0]);
});

methods.set('/posts.restore', async function ({response, searchParams, db}) {
  if (!searchParams.has('id')) {
    sendResponse(response, {status: statusBadRequest});
    return;
  }

  const id = Number(searchParams.get('id'));
  if (Number.isNaN(id)) {
    sendResponse(response, {status: statusBadRequest});
    return;
  }

  const table = await db.getTable('posts');
  const result = await table.update()
    .set('removed', false)
    .where('id = :id and removed = :removed')
    .bind('id', id)
    .bind('removed', true)
    .execute();

  const idNotFound = result.getAffectedItemsCount();

  if (idNotFound === 0) {
    sendResponse(response, {status: statusNotFound});
    return;
  }

  const resultReq = await table.select(['id', 'content', 'likes', 'created'])
    .where('id = :id')
    .bind('id', id)
    .execute();
    
  const columns = resultReq.getColumns();
  const data = resultReq.fetchAll();
  const post = data.map(map(columns));

  sendJSON(response, post[0]);
});

methods.set('/posts.like', async function ({response, searchParams, db}) {
  if (!searchParams.has('id')) {
    sendResponse(response, {status: statusBadRequest});
    return;
  }

  const id = Number(searchParams.get('id'));

  if (Number.isNaN(id)) {
    sendResponse(response, {status: statusBadRequest});
    return;
  }

  const table = await db.getTable('posts');

  const likesReq = await table.select(['likes'])
    .where('id = :id and removed = :removed')
    .bind('id', id)
    .bind('removed', false)
    .execute();
  
  const likes = likesReq.fetchOne();

  if (likes === undefined){
    sendResponse(response, {status: statusNotFound});
    return;
  }

  const result = await table.update()
    .set('likes', likes[0] + 1)
    .where('id = :id and removed = :removed')
    .bind('id', id)
    .bind('removed', false)
    .execute();
   
  const idNotFound = result.getAffectedItemsCount();

  if (idNotFound === 0) {
    sendResponse(response, {status: statusNotFound});
    return;
  }

  const resultReq = await table.select(['id', 'content', 'likes', 'created'])
    .where('id = :id')
    .bind('id', id)
    .execute();
    
  const columns = resultReq.getColumns();
  const data = resultReq.fetchAll();
  const post = data.map(map(columns));

  sendJSON(response, post[0]); 
});


methods.set('/posts.dislike', async function ({response, searchParams, db}) {
  if (!searchParams.has('id')) {
    sendResponse(response, {status: statusBadRequest});
    return;
  }

  const id = Number(searchParams.get('id'));

  if (Number.isNaN(id)) {
    sendResponse(response, {status: statusBadRequest});
    return;
  }

  const table = await db.getTable('posts');

  const likesReq = await table.select(['likes'])
    .where('id = :id and removed = :removed')
    .bind('id', id)
    .bind('removed', false)
    .execute();
  
  const likes = likesReq.fetchOne();
  if (likes === undefined){
    sendResponse(response, {status: statusNotFound});
    return;
  }

  const result = await table.update()
    .set('likes', likes[0] - 1)
    .where('id = :id and removed = :removed')
    .bind('id', id)
    .bind('removed', false)
    .execute();
   
  const idNotFound = result.getAffectedItemsCount();

  if (idNotFound === 0) {
    sendResponse(response, {status: statusNotFound});
    return;
  }

  const resultReq = await table.select(['id', 'content', 'likes', 'created'])
    .where('id = :id')
    .bind('id', id)
    .execute();
    
  const columns = resultReq.getColumns();
  const data = resultReq.fetchAll();
  const post = data.map(map(columns));

  sendJSON(response, post[0]); 
});
const server = http.createServer(async (request, response) => {
  const {pathname, searchParams} = new URL(request.url, `http://${request.headers.host}`);

  const method = methods.get(pathname);
  if (method === undefined) {
    sendResponse(response, {status: statusNotFound});
    return;
  }

  let session = null;
  try {
    session = await client.getSession();
    const db = await session.getSchema(schema);

    const params = {
      request,
      response,
      pathname,
      searchParams,
      db,
    };

    await method(params);
  } catch (e) {
    sendResponse(response, {status: statusInternalServerError});
  } finally {
    if (session !== null) {
      try {
        await session.close();
      } catch (e) {
        console.log(e);
      }
    }
  }
});

server.listen(port);
