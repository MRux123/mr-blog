<?php
$client_id = 'Ov23li3kgNlDH7K0oX1m'; 
$client_secret = '40f3dd2dca41f839925615bc1661093609e1e29c'; 

if (!isset($_GET['code'])) {
    $url = "https://github.com/login/oauth/authorize?client_id={$client_id}&scope=repo%20user";
    header("Location: $url");
    exit;
}

$ch = curl_init('https://github.com/login/oauth/access_token');
curl_setopt($ch, CURLOPT_POST, 1);
curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
    'client_id' => $client_id,
    'client_secret' => $client_secret,
    'code' => $_GET['code']
]));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_USERAGENT, 'MR-Blog-CMS-App'); 
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Accept: application/json']);
$response = curl_exec($ch);
curl_close($ch);

$data = json_decode($response, true);

if (isset($data['access_token'])) {
    $access_token = $data['access_token'];
    echo '<!DOCTYPE html>
    <html><body><script>
      function receiveMessage(e) {
        if (e.data === "authorizing:github") {
          window.opener.postMessage(
            \'authorization:github:success:{"token":"' . $access_token . '","provider":"github"}\',
            e.origin
          );
          window.removeEventListener("message", receiveMessage);
          window.close();
        }
      }
      window.addEventListener("message", receiveMessage, false);
      window.opener.postMessage("authorizing:github", "*");
    </script></body></html>';
} else {
    echo "Błąd GitHuba: " . htmlspecialchars($response);
}
?>
