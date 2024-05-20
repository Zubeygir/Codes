const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
const readline = require("readline");

//klasör isimlerini tutar
const folderNameRecord = {
  Code: "Code",
  Index: "Index",
  Processed: "Processed",
  "Unprocessed-Passwords": "Unprocessed-Passwords",
};

const basePath = path.resolve(__dirname, "..");

//klasör dizinlerini tutar
const folderPathRecord = {
  Code: path.join(basePath, folderNameRecord["Code"]),
  Index: path.join(basePath, folderNameRecord["Index"]),
  Processed: path.join(basePath, folderNameRecord["Processed"]),
  "Unprocessed-Passwords": path.join(
    basePath,
    folderNameRecord["Unprocessed-Passwords"]
  ),
};

const seperator = " | ";

/* 
  {
      [password's first character]: {
          [password]:{
              password,
              MD5Hash,
              Sha128,
              Sha256,
              source_file_name
          }
      }
  }
*/
const indexedPasswordRecord = {};

// kullanıcıdan girdi alma, terminale çıktı yazma işlemini sağlar
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Klasör bulunuyorsa true, bulunmuyorsa false döndürür.
const isFolderExists = async (path) => {
  return fs
    .access(path)
    .then(() => true)
    .catch(() => false);
};

// gelen input (passwordun ilk harfi) özel karakter mi kontrolü yapar, özel karakter ise "SPECIAL" döndürür değilse harfin kendisini döndürür.
const isSpecialCharsExists = (input) => {
  const specialCharRegex = /[!@#$%^&*(),.?":{}|<>_\-;+=~ÑÐï`\[\]\\\/]/g;

  if (specialCharRegex.test(input)) return "SPECIAL";
  return input;
};

// gelen input (password) için hashlenmiş yapıyı döndürür.
const generateHashedPasswordRecord = (input) => {
  const md5Hash = crypto.createHash("md5").update(input).digest("hex");
  const sha128Hash = crypto.createHash("sha1").update(input).digest("hex");
  const sha256Hash = crypto.createHash("sha256").update(input).digest("hex");

  return {
    MD5Hash: md5Hash,
    Sha128: sha128Hash,
    Sha256: sha256Hash,
  };
};

// gelen input (generateHashedPasswordRecord den oluşan obje) için formatlanmış stringi döndürür.
const generateProcessedPasswordFormat = ({
  password,
  MD5Hash,
  Sha128,
  Sha256,
  source_file_name,
}) => {
  return [password, MD5Hash, Sha128, Sha256, source_file_name].join(seperator);
};

// first karakter büyük harf ise /Index/Karakter
// değil ise /Index/Karakter'in büyük hali/Karakter olarak path döndürür.
const generateFirstCharacterFolderPathUnderIndexFolder = (firstCharacter) => {
  let folderPath;

  if (firstCharacter === firstCharacter.toUpperCase()) {
    folderPath = path.join(folderPathRecord.Index, firstCharacter);
  } else {
    folderPath = path.join(
      folderPathRecord.Index,
      firstCharacter.toUpperCase()
    );
    folderPath = path.join(folderPath, firstCharacter);
  }

  return folderPath;
};

// en son kaydedilen dosyayı ismindeki sayıya göre bulur.
// bu dosyanın ismindeki sayıyı ve bu dosyanın son satırının sayısını döndürür.
const getLastFileObject = async (folderPath) => {
  const files = await fs.readdir(folderPath);
  const validFiles = files.filter((file) => path.extname(file) === ".txt");

  if (validFiles.length > 0) {
    // dosya isimlerini "-" karakterinin sağ tarafında kalan kısmı int e çevirir, bu sayıları büyükten küçüğe sıralar ve pop ile ilk elemanı kaldırır
    // pop kaldırılmış elemanı geriye döndürdüğü için en büyük sayıya sahip olan dosyanın ismini döndürmüş olur.
    // bu dosyanın içeriğine bakarak dosyanın içeriği, dosyanın indexi (dosya ismindeki sayı) ve son satırın sayısı döndürülür.
    const lastFile = validFiles
      .sort((a, b) => parseInt(a.split("-")[1]) - parseInt(b.split("-")[1]))
      .pop();
    const lastFilePath = path.join(folderPath, lastFile);

    const fileIndex = parseInt(lastFile.split("-")[1]);
    const fileContent = await fs.readFile(lastFilePath, "utf-8");
    const lineCount = fileContent.split("\n").length - 1;

    return {
      fileIndex,
      fileContent,
      lineCount,
    };
  }

  return null;
};

const writeFile = async (fileName, writePath, fileContent) => {
  const filePath = path.join(writePath, fileName);

  await fs.writeFile(filePath, fileContent, { encoding: "utf-8" });
  console.log(`Dosyaya yazıldı: ${filePath}`);

  return;
};

// ilk olarak Unprocessed-Passwords klasörü var mı yok mu ona bakar eğer yoksa hata fırlatır
// varsa bu klasör içerisindeki dosyaları sırasıyla açar, her bir dosya için satır satır okuma yapar
// boş olan satırları yani son satırları geçer
// şifrenin ilk harfine bakarak indexlenmiş objenin eşleşen keyi yoksa o key için boş obje oluşturur
// varsa veriyi hashlenmiş obje yapısında password keyine kaydeder.
const readUnprocessedPasswordsFolder = async () => {
  try {
    const isUnprocessedPasswordsFolderExists = await isFolderExists(
      folderPathRecord["Unprocessed-Passwords"]
    );

    if (!isUnprocessedPasswordsFolderExists)
      throw new Error("Unprocessed-Passwords klasörü bulunamadı");

    const files = await fs.readdir(folderPathRecord["Unprocessed-Passwords"]);

    for (const file of files) {
      const filePath = path.join(
        folderPathRecord["Unprocessed-Passwords"],
        file
      );
      const fileStat = await fs.lstat(filePath);

      if (fileStat.isFile()) {
        try {
          const fileContent = await fs.readFile(filePath, {
            encoding: "utf-8",
          });
          const lines = fileContent.split("\n");

          for (const password of lines) {
            //boş satırları geçer
            if (password === "") continue;

            const firstCharacter = isSpecialCharsExists(password[0]);

            if (!indexedPasswordRecord[firstCharacter]) {
              indexedPasswordRecord[firstCharacter] = {};
            }

            if (indexedPasswordRecord[firstCharacter][password]) continue;

            const hashedPasswordRecord = generateHashedPasswordRecord(password);

            indexedPasswordRecord[firstCharacter][password] = {
              password,
              ...hashedPasswordRecord,
              source_file_name: file,
            };
          }
        } catch (err) {
          console.error(`Error reading file ${file}: ${err}`);
        }
      }
    }
  } catch (err) {
    console.error(`Error processing folder: ${err}`);
  }
};

// ilk olarak Index klasörü var mı yok mu ona bakar eğer yoksa hata fırlatır
// varsa indexedPasswordRecord objesi içerisinde tuttuğumuz keyler (ilk karakterler) ve bu şifrelerin tamamının tutulduğu obje üzerinde tarama yapar
// indexed klasörü altında dosyalar oluşturur
const writeProcessedPasswordsToIndexFolder = async () => {
  try {
    const isIndexFolderExists = await isFolderExists(folderPathRecord.Index);

    if (!isIndexFolderExists) throw new Error("Index klasörü bulunamadı");

    for (const [firstCharacter, passwordRecord] of Object.entries(
      indexedPasswordRecord
    )) {
      let firstCharacterFolderPathUnderIndexFolder =
        generateFirstCharacterFolderPathUnderIndexFolder(firstCharacter);

      const isFirstCharacterFolderUnderIndexFolderExists = await isFolderExists(
        firstCharacterFolderPathUnderIndexFolder
      );

      let fileIndex = 0;
      let lineCount = 0;
      let fileContent = "";

      try {
        // eğer bu klasör yoksa oluşturur
        if (!isFirstCharacterFolderUnderIndexFolderExists) {
          await fs.mkdir(firstCharacterFolderPathUnderIndexFolder, {
            recursive: true,
          });
          console.log(
            "Klasör oluşturuldu:",
            firstCharacterFolderPathUnderIndexFolder
          );
        } else {
          // klasör varsa ve eğer bu klasörde dosya varsa daha sonraki işlemlerde sonuna ekleme yapabilmek için son dosyanın verisi tutulur.
          const listFileData = await getLastFileObject(
            firstCharacterFolderPathUnderIndexFolder
          );
          if (listFileData) {
            fileIndex = listFileData.fileIndex;
            fileContent = listFileData.fileContent;
            lineCount = listFileData.lineCount;
          }
        }
      } catch (error) {
        console.error(
          firstCharacter,
          firstCharacterFolderPathUnderIndexFolder,
          error
        );
        continue;
      }

      for (const [, record] of Object.entries(passwordRecord)) {
        fileContent += generateProcessedPasswordFormat(record) + "\n";
        lineCount++;

        // her 10000 satırda bir fileIndex arttırıyor, satır sayısını 0 yapıyor ve içeriği boşaltıyor.
        if (lineCount === 10000) {
          const fileName = `${firstCharacter}-${fileIndex}.txt`;
          await writeFile(
            fileName,
            firstCharacterFolderPathUnderIndexFolder,
            fileContent
          );

          fileIndex++;
          lineCount = 0;
          fileContent = "";
        }
      }

      if (lineCount > 0) {
        const fileName = `${firstCharacter}-${fileIndex}.txt`;
        await writeFile(
          fileName,
          firstCharacterFolderPathUnderIndexFolder,
          fileContent
        );
      }
    }
  } catch (err) {
    console.error(`Error processing folder: ${err}`);
  }
};

// dosyaları unprocessed passwords klasöründen processed klasörüne taşır
const transportUnprocessedPasswordsToProcessedPasswordsFolder = async () => {
  try {
    const isUnprocessedPasswordsFolderExists = await isFolderExists(
      folderPathRecord["Unprocessed-Passwords"]
    );

    if (!isUnprocessedPasswordsFolderExists) return;

    const unprocessedPasswordsFiles = await fs.readdir(
      folderPathRecord["Unprocessed-Passwords"]
    );

    for (const file of unprocessedPasswordsFiles) {
      const filePath = path.join(
        folderPathRecord["Unprocessed-Passwords"],
        file
      );
      const transportedFilePath = path.join(folderPathRecord.Processed, file);

      await fs.rename(filePath, transportedFilePath);
    }
  } catch (err) {
    console.error(`Error processing folder: ${err}`);
  }
};

// şifrenin ilk harfine göre ilgili dosyalardan okuma yapar.
// eğer şifreyi bulamazsa null döndürür
// bulursa formatlanmış halini ve okuma sayısını döndürür
const searchPasswordInFiles = async (searchInput) => {
  let readCount = 1;

  try {
    const isIndexFolderExists = await isFolderExists(folderPathRecord.Index);
    if (!isIndexFolderExists) return null;

    const firstCharacter = isSpecialCharsExists(searchInput[0]);

    const firstCharacterFolderPathUnderIndexFolder =
      generateFirstCharacterFolderPathUnderIndexFolder(firstCharacter);

    const isFirstCharacterFolderExists = await isFolderExists(
      firstCharacterFolderPathUnderIndexFolder
    );
    if (!isFirstCharacterFolderExists) return null;

    const files = await fs.readdir(firstCharacterFolderPathUnderIndexFolder);
    for (const file of files) {
      const filePath = path.join(
        firstCharacterFolderPathUnderIndexFolder,
        file
      );
      const fileStat = await fs.lstat(filePath);

      if (fileStat.isFile()) {
        try {
          const fileContent = await fs.readFile(filePath, {
            encoding: "utf-8",
          });
          const lines = fileContent.split("\n");

          for (const passwordLine of lines) {
            // seperator olarak belirlediğimiz " | " karakterine göre ayırma yapar ve ilk elemanı yani şifre olması gereken elemanı seçer.
            // bu şifre ile searchInput aynı döndürme yapar
            const password = passwordLine.split(seperator)[0];

            if (password === searchInput)
              return { password: passwordLine, readCount, fileName: file };

            readCount++;
          }
        } catch (err) {
          console.error(`Error reading file ${file}: ${err}`);
        }
      }
    }
  } catch (err) {
    console.error(`Error processing folder: ${err}`);
  }

  return null;
};

// en son dosyayı bulur ve o dosya içerisine yazar.
const writePasswordToIndexFolder = async (searchInput) => {
  try {
    const isIndexFolderExists = await isFolderExists(folderPathRecord.Index);
    if (!isIndexFolderExists) throw new Error("Index klasörü bulunamadı");

    const firstCharacter = isSpecialCharsExists(searchInput[0]);

    const firstCharacterFolderPathUnderIndexFolder =
      generateFirstCharacterFolderPathUnderIndexFolder(firstCharacter);
    const isFirstCharacterFolderExists = await isFolderExists(
      firstCharacterFolderPathUnderIndexFolder
    );

    let fileIndex = 0;
    let lineCount = 0;
    let fileContent = "";

    if (!isFirstCharacterFolderExists) {
      await fs.mkdir(firstCharacterFolderPathUnderIndexFolder, {
        recursive: true,
      });
      console.log(
        "Klasör oluşturuldu:",
        firstCharacterFolderPathUnderIndexFolder
      );
    } else {
      const listFileData = await getLastFileObject(
        firstCharacterFolderPathUnderIndexFolder
      );
      if (listFileData) {
        fileIndex = listFileData.fileIndex;
        fileContent = listFileData.fileContent;
        lineCount = listFileData.lineCount;
      }
    }

    const hashedPasswordRecord = generateHashedPasswordRecord(searchInput);

    const processedPasswordFormat = generateProcessedPasswordFormat({
      password: searchInput,
      ...hashedPasswordRecord,
      source_file_name: "search",
    });

    if (lineCount === 10000) {
      fileIndex++;
      lineCount = 0;
      fileContent = "";
    }

    fileContent += processedPasswordFormat + "\n";

    const fileName = `${firstCharacter}-${fileIndex}.txt`;
    await writeFile(
      fileName,
      firstCharacterFolderPathUnderIndexFolder,
      fileContent
    );

    return { password: processedPasswordFormat, fileName };
  } catch (err) {
    console.error(`Error processing folder: ${err}`);
  }
};

// Sonsuz bir döngü yapısında kullanıcıdan input ister
// Eğer bulunursa: Arama süresini, (satır) arama sayısını , hangi dosyada bulduğunu ve detaylarını yazar.
// Eğer bulunamazsa: Arama süresini, (satır) arama sayısını , hangi dosyada bulduğunu ve detaylarını yazar.
const getSearchPasswordInput = () => {
  rl.question("Aramak istediğiniz şifreyi giriniz: ", async (password) => {
    console.time("Arama süresi");
    if (password.length !== 0) {
      const foundPasswordDetails = await searchPasswordInFiles(password);

      if (!foundPasswordDetails) {
        const writtenPassword = await writePasswordToIndexFolder(password);
        console.log(
          "Şifre bulunamadı, formatlanmış hali",
          writtenPassword.fileName,
          "dosyasına formatlanmış hali kaydedildi."
        );
      } else {
        console.log(
          foundPasswordDetails.readCount,
          "satır okuma sonucunda",
          foundPasswordDetails.fileName,
          "dosyasında formatlanmış şifre bulundu:"
        );
        console.log(foundPasswordDetails.password);
      }
    }

    console.timeEnd("Arama süresi");
    getSearchPasswordInput();
  });
};

const main = async () => {
  await readUnprocessedPasswordsFolder();
  await writeProcessedPasswordsToIndexFolder();
  await transportUnprocessedPasswordsToProcessedPasswordsFolder();

  getSearchPasswordInput();
};

main();
