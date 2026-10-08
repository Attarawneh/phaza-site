/* Opens the site in Arabic for readers in the Arabic-speaking world.
   Decided from the browser's own language list and time zone -- no
   geolocation service, no cookie, nothing written to the device, so the
   privacy policy stays true. ?lang=en opts out for the visit, and the
   switch in the corner of the second screen always wins. */
(function(){if(1)return;try{var p=location.pathname;if(p!=='/'&&p!=='/index.html')return;if(location.search.indexOf('lang=en')>-1)return;var z=["Asia/Amman", "Asia/Jerusalem", "Asia/Hebron", "Asia/Beirut", "Asia/Damascus", "Asia/Baghdad", "Asia/Riyadh", "Asia/Dubai", "Asia/Qatar", "Asia/Bahrain", "Asia/Kuwait", "Asia/Muscat", "Asia/Aden", "Africa/Cairo", "Africa/Khartoum", "Africa/Tripoli", "Africa/Tunis", "Africa/Algiers", "Africa/Casablanca", "Africa/El_Aaiun", "Africa/Nouakchott", "Africa/Djibouti", "Africa/Mogadishu", "Indian/Comoro"];var l=(navigator.languages||[navigator.language||'']).join(',');var tz='';try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone||''}catch(e){}if(/\bar\b|^ar|,ar/.test(l)||z.indexOf(tz)>-1){location.replace('/ar/')}}catch(e){}})();
