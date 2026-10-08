async ({name, mime, base64Data}) => {
  const read = key => { try { return JSON.parse(localStorage.getItem(key) || '{}') } catch { return {} } };
  const device = read('samantha_web_web_id');
  const tea = read('__tea_cache_tokens_497858');
  const fp = decodeURIComponent((document.cookie.match(/(?:^|;\s*)s_v_web_id=([^;]+)/) || [,''])[1]);
  const common = () => {
    const query = new URLSearchParams({
      version_code:'20800', language:'zh', device_platform:'web', doubao_device_platform:'web',
      aid:'497858', real_aid:'497858', pkg_type:'release_version', device_id:device.web_id || '',
      pc_version:'3.27.4', doubao_pc_version:'3.27.4', web_id:tea.web_id || tea.user_unique_id || '',
      tea_uuid:tea.user_unique_id || tea.web_id || '', region:'CN', sys_region:'CN',
      samantha_web:'1', web_platform:'browser', web_tab_id:crypto.randomUUID()
    });
    query.set('use-olympus-account', '1');
    if (fp) query.set('fp', fp);
    return query;
  };
  const encoder = new TextEncoder();
  const fetchTimed = (url, options = {}, milliseconds = 30000) => fetch(url, {...options, signal:AbortSignal.timeout(milliseconds)});
  const hex = bytes => Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  const sha256 = async value => new Uint8Array(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? encoder.encode(value) : value));
  const hmac = async (key, value) => {
    const imported = await crypto.subtle.importKey('raw', typeof key === 'string' ? encoder.encode(key) : key, {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', imported, encoder.encode(value)));
  };
  const signV4 = async (method, url, body, credentials) => {
    const parsed = new URL(url, location.origin);
    const iso = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = iso.slice(0, 8);
    const amzDate = iso.slice(0, 15) + 'Z';
    const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
    const params = [...parsed.searchParams.entries()].sort(([a, av], [b, bv]) => compare(a, b) || compare(av, bv));
    const canonicalQuery = params.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
    const headers = {host: parsed.hostname, 'x-amz-date': amzDate};
    if (credentials.session_token) headers['x-amz-security-token'] = credentials.session_token;
    const signedHeaders = Object.keys(headers).sort().join(';');
    const canonicalHeaders = Object.keys(headers).sort().map(key => `${key}:${headers[key]}\n`).join('');
    const payloadHash = hex(await sha256(body || ''));
    const canonical = `${method}\n${parsed.pathname || '/'}\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const scope = `${date}/cn-north-1/imagex/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${hex(await sha256(canonical))}`;
    const dateKey = await hmac(`AWS4${credentials.secret_key}`, date);
    const regionKey = await hmac(dateKey, 'cn-north-1');
    const serviceKey = await hmac(regionKey, 'imagex');
    const signingKey = await hmac(serviceKey, 'aws4_request');
    const signature = hex(await hmac(signingKey, stringToSign));
    return {
      Authorization:`AWS4-HMAC-SHA256 Credential=${credentials.access_key}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'x-amz-date':amzDate, 'x-amz-content-sha256':payloadHash,
      ...(credentials.session_token ? {'x-amz-security-token':credentials.session_token} : {})
    };
  };
  const bytes = Uint8Array.from(atob(base64Data), character => character.charCodeAt(0));
  const extension = name?.includes('.') ? `.${name.split('.').pop().toLowerCase()}` : (mime === 'image/jpeg' ? '.jpg' : '.png');
  const crcTable = new Uint32Array(256);
  for (let index = 0; index < 256; index++) { let value = index; for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1); crcTable[index] = value >>> 0; }
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  const crcHex = ((crc ^ 0xFFFFFFFF) >>> 0).toString(16).padStart(8, '0');

  const prepareQuery = common();
  const prepareResponse = await fetchTimed('/alice/resource/prepare_upload?' + prepareQuery, {
    method:'POST', credentials:'include', headers:{'content-type':'application/json'},
    body:JSON.stringify({tenant_id:'5', scene_id:'5', resource_type:2})
  });
  const prepare = await prepareResponse.json();
  if (!prepareResponse.ok || prepare.code !== 0) throw new Error(`prepare_upload failed: ${prepare.msg || prepareResponse.status}`);
  const serviceId = prepare.data.service_id;
  const credentials = prepare.data.upload_auth_token;
  if (!credentials?.access_key || !credentials?.secret_key) throw new Error('prepare_upload missing STS credentials');

  const applyQuery = new URLSearchParams({
    Action:'ApplyImageUpload', Version:'2018-08-01', ServiceId:serviceId, NeedFallback:'true', UploadNum:'1',
    FileSize:String(bytes.length), FileExtension:extension, s:'jdnfglwfkl'
  });
  const applyUrl = '/top/v1?' + applyQuery;
  const applyResponse = await fetchTimed(applyUrl, {method:'GET', credentials:'include', headers:await signV4('GET', applyUrl, '', credentials)});
  const apply = await applyResponse.json();
  if (!applyResponse.ok || !apply.Result) throw new Error(`ApplyImageUpload failed: ${JSON.stringify(apply).slice(0, 500)}`);
  const uploadAddress = apply.Result.UploadAddress || {};
  const store = uploadAddress.StoreInfos?.[0];
  const uploadHost = uploadAddress.UploadHosts?.[0] || apply.Result.InnerUploadAddress?.UploadNodes?.[0]?.UploadHost;
  if (!store || !uploadHost) throw new Error('ApplyImageUpload missing upload address');

  const uploadResponse = await fetchTimed(`https://${uploadHost}/upload/v1/${store.StoreUri}`, {
    method:'POST', headers:{Authorization:store.Auth, 'Content-CRC32':crcHex, 'Content-Type':'application/octet-stream'}, body:bytes
  }, 45000);
  const upload = await uploadResponse.json().catch(() => ({}));
  if (!uploadResponse.ok || (upload.code !== undefined && upload.code !== 2000)) throw new Error(`TOS upload failed: ${JSON.stringify(upload).slice(0, 500)}`);

  const commitBody = JSON.stringify({SessionKey:uploadAddress.SessionKey});
  const commitQuery = new URLSearchParams({Action:'CommitImageUpload', Version:'2018-08-01', ServiceId:serviceId});
  const commitUrl = '/top/v1?' + commitQuery;
  const commitResponse = await fetchTimed(commitUrl, {
    method:'POST', credentials:'include', headers:{...(await signV4('POST', commitUrl, commitBody, credentials)), 'content-type':'application/json'}, body:commitBody
  });
  const commit = await commitResponse.json();
  const result = commit.Result?.Results?.[0];
  if (!commitResponse.ok || !result || result.UriStatus !== 2000) throw new Error(`CommitImageUpload failed: ${JSON.stringify(commit).slice(0, 500)}`);
  const plugin = commit.Result.PluginResult?.[0] || {};
  const uri = result.Uri || plugin.ImageUri || store.StoreUri;
  const identifier = crypto.randomUUID();
  const preQuery = common();
  const preResponse = await fetchTimed('/alice/message/pre_handle_v2_without_conv?' + preQuery, {
    method:'POST', credentials:'include', headers:{'content-type':'application/json'},
    body:JSON.stringify({uplink_entity:{entity_type:2, entity_content:{image:{key:uri}}, identifier}, bot_id:'7338286299411103781', local_message_id:crypto.randomUUID()})
  });
  const pre = await preResponse.json();
  if (!preResponse.ok || pre.code !== 0) throw new Error(`pre_handle failed: ${pre.msg || preResponse.status}`);
  return {identifier, uri, name:name || plugin.FileName || `image${extension}`, width:plugin.ImageWidth || null, height:plugin.ImageHeight || null, url:'', pre_generate_id:pre.data?.pre_generate_id || ''};
}
